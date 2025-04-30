// upfitter.processor.js
const { isUpfitterBusiness, extractCompanyDetails } = require('../services/openai.service');
const { searchSerper } = require('../services/serper.service.js');

const CONFIG = {
  maxResultsPerCity: 20,
  minDelay: 2000,
  maxDelay: 5000,
  navigationTimeout: 30000,
  openAIConcurrency: 5
};

const randomDelay = () => new Promise(resolve =>
  setTimeout(resolve, CONFIG.minDelay + Math.random() * (CONFIG.maxDelay - CONFIG.minDelay))
);

// Scrape website content
async function scrapeWebsite(cluster, url) {
  try {
    const text = await cluster.execute({ url }, async ({ page, data }) => {
      await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
      await page.setRequestInterception(true);
      page.on('request', req =>
        ['image', 'stylesheet', 'font'].includes(req.resourceType()) ? req.abort() : req.continue()
      );
      await page.goto(data.url, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() =>
        document.querySelectorAll('script, style, iframe').forEach(el => el.remove())
      );
      return await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
    });

    return text;
  } catch (err) {
    console.error(`Error scraping ${url}: ${err.message}`);
    return null;
  }
}

async function processCity(cluster, city, index, total, openAiLimit) {
  console.log(`Processing city ${index + 1}/${total}: ${city}`);
  try {
    const query = `Upfitters in ${city}`;
    const results = await searchSerper(query, 0);
    const result_2 =await searchSerper(query, 10);
    const results = [ ...result_1.organic, ...result_2.organic ]
    const organic = results || [];

    if (organic.length === 0) {
      console.log(`No results for ${city}`);
      return [];
    }

    const filtered = [];
    for (let result of organic) {
      await openAiLimit(async () => {
        const isRelevant = await isUpfitterBusiness(result.title, result.snippet, result.link);
        if (isRelevant) filtered.push(result);
        await randomDelay();
      });
    }

    const finalResults = [];
    for (const result of filtered.slice(0, CONFIG.maxResultsPerCity)) {
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
        finalResults.push(company);
        await randomDelay();
      } catch (err) {
        console.error(`Error processing ${result.link}: ${err.message}`);
      }
    }

    console.log(`Finished ${city}: ${finalResults.length} upfitters found`);
    return finalResults;
  } catch (err) {
    console.error(`Error with city ${city}: ${err.message}`);
    return [];
  }
}

module.exports = { processCity };
