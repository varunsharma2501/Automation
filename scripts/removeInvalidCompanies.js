const fs = require('fs');
const axios = require('axios');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Validate URL syntax + reachability
async function isValidURL(url) {
  try {
    new URL(url); // syntax check
    const response = await axios.get(url, { timeout: 5000 });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

async function processCSV(inputFilePath, outputValidPath, outputInvalidPath) {
  const rows = [];
  const validRows = [];
  const invalidRows = [];
    let count=0;
  fs.createReadStream(inputFilePath)
    .pipe(csv())
    .on('data', (data) => rows.push(data))
    .on('end', async () => {
      for (const row of rows) {
        const url = row.companyUrl?.trim();
        count++;
        console.log("Count",count)
        if (await isValidURL(url)) {
          validRows.push(row);
        } else {
          invalidRows.push(row);
        }
      }

      const headers = Object.keys(rows[0]).map((key) => ({ id: key, title: key }));

      await createCsvWriter({ path: outputValidPath, header: headers }).writeRecords(validRows);
      await createCsvWriter({ path: outputInvalidPath, header: headers }).writeRecords(invalidRows);

      console.log(`✅ Valid URLs saved to: ${outputValidPath}`);
      console.log(`❌ Invalid URLs saved to: ${outputInvalidPath}`);
    });
}

// Go up one level from the current script folder to access ExcelFiles
const basePath = path.join(__dirname, '..', 'Excels');
const inputFilePath = path.join(basePath, 'Leads-Input.csv');
const outputValidPath = path.join(basePath, 'validCompanies.csv');
const outputInvalidPath = path.join(basePath, 'invalidCompanies.csv');

console.log("Input path",inputFilePath)
processCSV(inputFilePath, outputValidPath, outputInvalidPath);
