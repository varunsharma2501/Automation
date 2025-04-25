const { searchSerper } = require('../services/serperService');
const openai = require('../config/openai.config'); // assuming OpenAI is already set up in your project
const puppeteer = require('puppeteer-extra'); // Use puppeteer-extra instead of puppeteer
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin()); // Apply stealth plugin to puppeteer-extra

const writeToSheet = require("../services/writeToSheet");


// Function to get search results from Serper API
const getSearchResults = async (query) => {
  if (!query) throw new Error('Missing search query');

  try {
    const page1 = await searchSerper(query, 0);   // start at 0
    const page2 = await searchSerper(query, 10);  // start at 10

    const results1 = page1.organic || [];
    const results2 = page2.organic || [];

    return [...results1, ...results2]; // Combine top 20
  } catch (error) {
    throw new Error('Failed to fetch data from Serper API');
  }
};

const filterRelevantUpfitterLinks = async (organicArray) => {
  const filteredResults = [];

  for (const result of organicArray) {
    const { title, link, snippet } = result;

    const prompt = `
    You are a strict filter for business websites.
    
    Given a link with its title and description, decide **only** if it belongs to a company that directly performs vehicle upfitting services — such as police car outfitting, fleet vehicle installations, van conversions, or commercial/emergency vehicle customization.
    
    The site must clearly belong to a **business that performs upfitting work**, not directories, review platforms, job boards, articles, marketplaces, forums, or resellers.
    
    Examples of what should be marked as **invalid**:
    - Godaddy parked domains or builder pages
    - LinkedIn, Glassdoor, Yelp, or any job/review site
    - News articles, Wikipedia, blogs
    - Dealer listings or parts suppliers that don't do installations
    - Product-only catalog pages
    
    Examples of what should be **valid**:
    - A company website showing upfitting services or completed fleet builds
    - Service providers with installation galleries, contact info, and service offerings
    
    Now evaluate:
    
    Title: ${title}
    Link: ${link}
    Snippet: ${snippet}
    
    Reply strictly with one of:
    - valid
    - invalid
    
    Answer only with: valid or invalid.
    `;
    

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      });

      const decision = response.choices[0].message.content.trim().toLowerCase();
      if (decision === "valid") {
        filteredResults.push(result);
      }
    } catch (err) {
      console.error("OpenAI error:", err.message);
    }
  }

  return filteredResults;
};



// Function to scrape all text content from the website
const scrapeWebsiteData = async (page, url) => {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const textContent = await page.evaluate(() => document.body.innerText);
    return textContent;
  } catch (error) {
    console.error('Error scraping website:', url, error.message);
    return 'Error scraping the website';
  }
};

// Function to ask GPT for the structured company data from scraped text
const getCompanyDetailsFromGPT = async (upfitterObject) => {
  const { scrapedText, title, snippet, link } = upfitterObject;

  const prompt = `
I have the following text from a company's website:

"${scrapedText}"

Please extract the following details:
1. Company Name
2. Contact Details (Phone, Email, etc.)
3. Location
4. Description of the company
5. Owner Name

Format your response like this:
{
  "name": "<Company Name>",
  "contactDetails": "<Contact Information>",
  "location": "<Location>",
  "description": "<Description>",
  "ownerName": "<Owner Name>",
  "companyUrl": "<URL>"
}
If any field is missing or unclear, return 'NA'.
Only return this JSON object. Do not add any extra text.
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are an expert business data extractor.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
    });

    const content = response.choices[0].message.content.trim();

    // Extract first JSON object block using RegEx
    const jsonMatch = content.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON block found in GPT response");
    }

    let extractedData = JSON.parse(jsonMatch[0]);

    // Fallbacks
    if (!extractedData.name || extractedData.name === 'NA') {
      extractedData.name = title || 'NA';
    }

    if (!extractedData.description || extractedData.description === 'NA') {
      extractedData.description = snippet || 'NA';
    }

    extractedData.companyUrl = link || 'NA';

    return extractedData;
  } catch (error) {
    console.error('Error extracting company details from GPT:', error.message);
    console.error('Raw GPT response:', error.response?.data || 'Not available');

    return {
      name: title || 'NA',
      contactDetails: 'NA',
      location: 'NA',
      description: snippet || 'NA',
      ownerName: 'NA',
      companyUrl: link || 'NA'
    };
  }
};

// Main function to process search results in sequence
const processUpfitterSearchResults = async (query, browser) => {
  try {
    const organicArray = await getSearchResults(query);
    const relevantUpfitters = await filterRelevantUpfitterLinks(organicArray);

    const page = await browser.newPage();
    const finalResults = [];

    for (const result of relevantUpfitters) {
      const { link } = result;

      const scrapedText = await scrapeWebsiteData(page, link);
      const enrichedResult = { ...result, scrapedText };

      const companyDetails = await getCompanyDetailsFromGPT(enrichedResult);
      finalResults.push(companyDetails);

      // ✅ Small delay to avoid rapid-fire loads (optional)
      await new Promise((r) => setTimeout(r, 1000));
    }

    await page.close();
    return finalResults;

  } catch (error) {
    console.error('Error processing upfitter search results:', error);
    return [];
  }
};


const getUpfittersByCities = async (req, res) => {
  const { cities } = req.body;

  if (!Array.isArray(cities) || cities.length === 0) {
    return res.status(400).json({ error: "Please provide a non-empty array of cities in the request body." });
  }

  const allResults = [];
  let browser;

  try {
    // Launch browser once
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote',
      ],
    });

    for (const city of cities) {
      console.log(`Processing city: ${city}`);
      const query = `List all upfitters for ${city}`;

      try {
        const cityResults = await processUpfitterSearchResults(query, browser); // pass browser
        allResults.push(...cityResults);
      } catch (err) {
        console.error(`Failed to process city "${city}":`, err.message);
      }
    }

    await writeToSheet(allResults, "Latest-Upfitters-Scrapping");
    return res.status(200).json(allResults);

  } catch (error) {
    console.error("Error in getUpfittersByCities:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    if (browser) await browser.close();
  }
};



module.exports = { getUpfittersByCities };
