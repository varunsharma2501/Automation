const fs = require('fs');
const axios = require('axios');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const CONCURRENCY_LIMIT = 20;

// Validate URL syntax + reachability
async function isValidURL(url) {
  try {
    new URL(url); // Syntax check
    const response = await axios.get(url, { timeout: 5000 });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

async function validateInBatches(rows, key = 'companyUrl') {
  const validRows = [];
  const invalidRows = [];

  for (let i = 0; i < rows.length; i += CONCURRENCY_LIMIT) {
    const batch = rows.slice(i, i + CONCURRENCY_LIMIT);

    const validations = await Promise.allSettled(
      batch.map(row => isValidURL(row[key]?.trim()))
    );

    validations.forEach((result, index) => {
      const row = batch[index];
      if (result.status === 'fulfilled' && result.value) {
        validRows.push(row);
      } else {
        invalidRows.push(row);
      }
    });

    // Optional: Log progress
    console.log(`✅ Processed: ${Math.min(i + CONCURRENCY_LIMIT, rows.length)} / ${rows.length}`);
  }

  return { validRows, invalidRows };
}

async function processCSV(inputFilePath, outputValidPath, outputInvalidPath) {
  const rows = [];

  fs.createReadStream(inputFilePath)
    .pipe(csv())
    .on('data', (data) => rows.push(data))
    .on('end', async () => {
      console.log(`📦 Total rows: ${rows.length}`);
      const { validRows, invalidRows } = await validateInBatches(rows);

      const headers = Object.keys(rows[0]).map((key) => ({ id: key, title: key }));

      await createCsvWriter({ path: outputValidPath, header: headers }).writeRecords(validRows);
      await createCsvWriter({ path: outputInvalidPath, header: headers }).writeRecords(invalidRows);

      console.log(`✅ Valid: ${validRows.length}`);
      console.log(`❌ Invalid: ${invalidRows.length}`);
      console.log(`📁 Output written to ${outputValidPath} and ${outputInvalidPath}`);
    });
}

// File paths
const basePath = path.join(__dirname, '..', 'Excels');
const inputFilePath = path.join(basePath, 'StrobesNMore - MasterSheet.csv');
const outputValidPath = path.join(basePath, 'validCompanies.csv');
const outputInvalidPath = path.join(basePath, 'invalidCompanies.csv');

processCSV(inputFilePath, outputValidPath, outputInvalidPath);
