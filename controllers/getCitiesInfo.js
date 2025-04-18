const { fetchCityInfo } = require("../services/openai.service");
const {filterResponsesByValidURL,validateResponsesByCompanyUrl}=require("./filterValidCompanies")
const updateMissingInfo=require("./populatePhoneCompanyUrl")
const writeToSheet = require("../services/writeToSheet");
const { response } = require("express");

const BATCH_SIZE = 10;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const generateInfoForCities = async (req, res) => {
  const { cities } = req.body;
  console.log("Received cities", cities.length);

  if (!cities || !Array.isArray(cities) || cities.length === 0) {
    return res.status(400).json({ error: "An array of cities is required." });
  }

  let responses = [];

  try {
    for (let i = 0; i < cities.length; i += BATCH_SIZE) {
      const batch = cities.slice(i, i + BATCH_SIZE);

      console.log(`Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(cities.length / BATCH_SIZE)}`);

      const batchResponses = await Promise.all(
        batch.map(city =>
          fetchCityInfo(city)
            .then(data => data)
            .catch(err => {
              console.warn(`Error fetching data for city "${city}":`, err.message);
              return [];
            })
        )
      );

      responses.push(...batchResponses.flat());

      // Optional: wait between batches to avoid hitting rate limits
      await wait(500); // Wait 500ms between batches (adjust if needed)
    }
    console.log("Responses obtained from OpenAI API", responses.length)
    responses=await updateMissingInfo(responses);
    await wait(500)
    responses=await updateMissingInfo(responses);
    await wait(500)
    console.log("Ran retries to populate missing phone and company URL",responses.length)
    responses = await filterResponsesByValidURL(responses);
    console.log("Opening Companyurls are",responses.length)
    responses=await validateResponsesByCompanyUrl(responses);
    console.log("final responses after marking irrelevant urls",responses.length)
    const sheetResponse = await writeToSheet(responses);

    console.log("🧾 Google Sheet Updated:", sheetResponse);
    res.status(200).json({ data: responses });

  } catch (error) {
    console.error("Error processing city info:", error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
};

module.exports = {
  generateInfoForCities,
};
