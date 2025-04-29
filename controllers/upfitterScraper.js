// upfitter.controller.js
const { writeToSheet } = require('../services/google.sheet.service.js');
const { processCity } = require('../services/upfitter.processor.service.js');
const { Cluster } = require('puppeteer-cluster');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer-extra');
const { v4: uuidv4 } = require('uuid');

puppeteer.use(StealthPlugin());

const CONFIG = {
  clusterConcurrency: 5,
  headless: new
};

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

async function getUpfittersByCities(req, res) {
  const { cities } = req.body;
  const requestId = uuidv4().slice(0, 8);

  if (!Array.isArray(cities) || cities.length === 0) {
    return res.status(400).json({
      error: "Please provide a non-empty array of cities",
      example: { cities: ["New York", "Los Angeles"] }
    });
  }

  console.log(`[${requestId}] Job started for ${cities.length} cities`);
  const allResults = [];
  const openAiLimit = (fn) => fn(); 
  const cluster = await initCluster();

  try {
    const chunkSize = 3;
    for (let i = 0; i < cities.length; i += chunkSize) {
      const chunk = cities.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map((city, idx) =>
        processCity(cluster, city, i + idx, cities.length, openAiLimit)
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
