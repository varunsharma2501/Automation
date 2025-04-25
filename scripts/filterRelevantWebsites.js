const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const openai = require('../config/openai.config'); // Adjust if needed

puppeteer.use(StealthPlugin());

const basePath = path.join(__dirname, '..', 'Excels');
const inputFilePath = path.join(basePath, 'Upfitters - Cleaned sheet.csv');
const outputFilePath = path.join(basePath, 'FilteredData.csv');

const readCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};

const scrapeWebsiteText = async (page, url) => {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const text = await page.evaluate(() => document.body.innerText);
    return text.slice(0, 4000); // Avoid token overflow
  } catch (error) {
    console.error(`Error scraping ${url}:`, error.message);
    return "Error scraping the website";
  }
};

const isValidUpfitterByChatGPT = async (name, companyUrl, scrapedText) => {
    const prompt = `
  You are a strict classifier.
  
  Your task is to verify whether the following company is a **verified vehicle upfitter or installer based in the US**, with a specific focus on **police and emergency vehicles**.
  
  Inclusion Criteria:
  1. Company should be located in the United States.
  2. Must specialize in **fleet installation**, **commercial vehicle upfitting**, or **emergency vehicle outfitting**.
  3. Descriptions should ideally include terms like "fleet installation", "vehicle outfitting", "emergency conversions", etc.
  4. Only valid if the company’s own website directly provides information about their **installation or upfitting services**.
  
  Strict Exclusion Criteria:
  - Do NOT validate general pages like LinkedIn, Glassdoor, GoDaddy, Wix, news articles, blogs, hosting services, or directory sites.
  - Reject pages that do NOT belong to actual service-providing companies.
  - Reject pages that ONLY sell products and do NOT mention installation/upfitting services.
  
  Given:
  Company Name: ${name}
  Website: ${companyUrl}
  Extracted Website Text:
  """${scrapedText}"""
  
  Your job is to return ONLY one of the two words:
  - valid
  - invalid
  `;
  
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      });
  
      const decision = response.choices[0].message.content.trim().toLowerCase();
      return decision === 'valid';
    } catch (err) {
      console.error('OpenAI error:', err.message);
      return false;
    }
  };
  

const writeCSV = (filePath, data) => {
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];

  data.forEach(row => {
    const values = headers.map(header => `"${(row[header] || '').replace(/"/g, '""')}"`);
    csvRows.push(values.join(','));
  });

  fs.writeFileSync(filePath, csvRows.join('\n'), 'utf-8');
};

const processCSVData = async () => {
  const data = await readCSV(inputFilePath);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const finalData = [];

  for (const row of data) {
    const { name, companyUrl } = row;

    if (!companyUrl || !companyUrl.startsWith('http')) {
      console.warn(`Skipping invalid URL: ${companyUrl}`);
      continue;
    }

    const scrapedText = await scrapeWebsiteText(page, companyUrl);
    row.scrapedText = scrapedText;

    const isValid = await isValidUpfitterByChatGPT(name, companyUrl, scrapedText);
    if (isValid) {
      finalData.push(row);
    }
  }

  await browser.close();

  if (finalData.length > 0) {
    writeCSV(outputFilePath, finalData);
    console.log(`✅ Filtered data written to: ${outputFilePath}`);
  } else {
    console.log('⚠️ No valid upfitters found.');
  }
};

processCSVData();
