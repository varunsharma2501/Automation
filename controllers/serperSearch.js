const { isUpfitterBusiness, extractCompanyDetails } = require('../services/openai.service');
const { searchSerper } = require('../services/serper.service.js');
const { writeToSheet } = require('../services/google.sheet.service.js');
const { Cluster } = require('puppeteer-cluster');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer-extra');
const { v4: uuidv4 } = require('uuid');

// Apply stealth plugin
puppeteer.use(StealthPlugin());

const CONFIG = {
  maxResultsPerCity: 20,
  clusterConcurrency: 5,
  minDelay: 2000,
  maxDelay: 5000,
  navigationTimeout: 30000,
  headless: true,
  openAIConcurrency: 5
};

// Random delay to avoid hitting services too quickly
const randomDelay = () => new Promise(resolve =>
  setTimeout(resolve, CONFIG.minDelay + Math.random() * (CONFIG.maxDelay - CONFIG.minDelay))
);

// Initialize Puppeteer Cluster
async function initCluster() {
  return await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: CONFIG.clusterConcurrency,
    puppeteer,
    puppeteerOptions: {
      headless: CONFIG.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    monitor: false
  });
}

// Scrape website text content
async function scrapeWebsite(cluster, url) {
  try {
    const scrapedText = await cluster.execute({ url }, async ({ page, data }) => {
      await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
      await page.setRequestInterception(true);
      page.on('request', req =>
        ['image', 'stylesheet', 'font'].includes(req.resourceType()) ? req.abort() : req.continue()
      );

      await page.goto(data.url, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        document.querySelectorAll('script, style, iframe').forEach(el => el.remove());
      });
      return await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
    });

    return scrapedText;
  } catch (err) {
    console.error(`Error scraping ${url}: ${err.message}`);
    return null;
  }
}

// Process a single city with concurrency control
async function processCity(cluster, city, index, total, openAiLimit) {
  console.log(`Processing city ${index + 1}/${total}: ${city}`);
  try {
    const query = `Upfitters in ${city}`;
    const searchResults = await searchSerper(query, 0);
    const organicResults = searchResults.organic || [];

    if (organicResults.length === 0) {
      console.log(`No results found for ${city}`);
      return [];
    }

    // Filter and process results in batches
    const filtered = [];
    for (let i = 0; i < organicResults.length; i++) {
      const result = organicResults[i];
      await openAiLimit(async () => {
        const isRelevant = await isUpfitterBusiness(result.title, result.snippet, result.link);
        if (isRelevant) filtered.push(result);
        await randomDelay();
      });
    }

    const cityData = [];
    const limitedResults = filtered.slice(0, CONFIG.maxResultsPerCity);

    // Process results to scrape content
    for (const result of limitedResults) {
      try {
        const content = await scrapeWebsite(cluster, result.link);
        if (!content) continue;

        const company = await extractCompanyDetails({
          scrapedText: content,
          title: result.title,
          snippet: result.snippet,
          link: result.link
        });

        company.city = city;
        cityData.push(company);
        await randomDelay();
      } catch (err) {
        console.error(`Error processing ${result.link}: ${err.message}`);
      }
    }

    console.log(`Processed ${cityData.length} upfitters for ${city}`);
    return cityData;
  } catch (err) {
    console.error(`Error processing city ${city}: ${err.message}`);
    return [];
  }
}

// Controller: get upfitters by cities
async function getUpfittersByCities(req, res) {
  const { cities } = req.body;
  const requestId = uuidv4().slice(0, 8);

  if (!Array.isArray(cities) || cities.length === 0) {
    return res.status(400).json({
      error: "Please provide a non-empty array of cities",
      example: { cities: ["New York", "Los Angeles"] }
    });
  }

  console.log(`[${requestId}] Starting job for ${cities.length} cities`);

  const allResults = [];
  const openAiLimit = (fn) => fn(); 
  const cluster = await initCluster();

  try {
    // Process cities concurrently but in controlled batches
    const chunkSize = 3; 
    for (let i = 0; i < cities.length; i += chunkSize) {
      const chunk = cities.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map((city, index) =>
        processCity(cluster, city, index + i, cities.length, openAiLimit)
      ));
      allResults.push(...chunkResults.flat());
    }

    await writeToSheet(allResults, `Upfitters`);
    res.status(200).json({
      requestId,
      totalCities: cities.length,
      resultsFound: allResults.length,
      data: allResults
    });
  } catch (error) {
    console.error(`[${requestId}] Error: ${error.message}`);
    res.status(500).json({
      requestId,
      error: "Processing failed",
      message: error.message
    });
  } finally {
    await cluster.close();
  }
}

module.exports = { getUpfittersByCities };
