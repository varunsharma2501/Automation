const { searchSerper } = require('../services/serperService');
const openai = require('../config/openai.config'); // assuming OpenAI is already set up in your project
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const writeToSheet = require("../services/writeToSheet");


// Function to get search results from Serper API
const getSearchResults = async (query) => {
  if (!query) {
    throw new Error('Missing search query');
  }

  try {
    const data = await searchSerper(query);
    return data.organic || [];
  } catch (error) {
    throw new Error('Failed to fetch data from Serper API');
  }
};

const filterRelevantUpfitterLinks = async (organicArray) => {
  const filteredResults = [];

  for (const result of organicArray) {
    const { title, link, snippet } = result;

    const prompt = `
Decide if this link is for a company that does vehicle upfitting (e.g., police car outfitting, van conversions, fleet installations):

Title: ${title}
Link: ${link}
Snippet: ${snippet}

Only reply:
- "valid" → if it’s a company website doing upfitting or installation services.
- "invalid" → if it’s a job board, review site, article, product catalog, or unrelated.

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
const scrapeWebsiteData = async (url) => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const textContent = await page.evaluate(() => document.body.innerText);
    await browser.close();
    return textContent;
  } catch (error) {
    console.error('Error scraping website:', error);
    return 'Error scraping the website'; // Return a default error message on failure
  } finally {
    if (browser) await browser.close();
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
    let extractedData = JSON.parse(content);

    // Fallback replacements
    if (!extractedData.name || extractedData.name === 'NA') {
      extractedData.name = title;
    }

    if (!extractedData.description || extractedData.description === 'NA') {
      extractedData.description = snippet;
    }

    extractedData.companyUrl = link; // Always override with actual link

    return extractedData;
  } catch (error) {
    console.error('Error extracting company details from GPT:', error);
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
const processUpfitterSearchResults = async (query) => {
  try {
    // Step 1: Get search results from Serper API
    const organicArray = await getSearchResults(query);
    console.log(`Organic array from serper length ${organicArray.length}: ${JSON.stringify(organicArray,null,2)}`);

    // Step 2: Filter relevant upfitter links based on GPT classification
    const relevantUpfitters = await filterRelevantUpfitterLinks(organicArray);
    console.log(`Filtered organic array length ${relevantUpfitters.length} ${JSON.stringify(relevantUpfitters,null,2)}`);
    // Step 3: Scrape website data and extract details using GPT
    const finalResults = [];
    for (const result of relevantUpfitters) {
      const { link } = result;

      // Scrape the text content from the website
      const scrapedText = await scrapeWebsiteData(link);
      // console.log("Scraped text from website:",link," -- ", scrapedText);
      const enrichedResult = { ...result, scrapedText };
      // Get company details using GPT
      const companyDetails = await getCompanyDetailsFromGPT(enrichedResult);

      // Push the details to the final results array
      finalResults.push(companyDetails);
    }
    console.log("Final results after scraping and GPT extraction:", JSON.stringify(finalResults,null,2));
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

  for (const city of cities) {
    const query = `List all upfitters for ${city}`;
    try {
      const cityResults = await processUpfitterSearchResults(query);
      allResults.push(...cityResults); // flattening into one array
    } catch (err) {
      console.error(`Failed to process city "${city}":`, err.message);
    }
  }

  
  await writeToSheet(allResults, "Latest-Upfitters-Scrapping");

  return res.status(200).json(allResults);
};


module.exports = { getUpfittersByCities };
