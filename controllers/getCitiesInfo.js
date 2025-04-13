const { fetchCityInfo } = require("../services/openai.service");
const generateCSV = require("../services/createCSV");

const BATCH_SIZE = 10;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const generateInfoForCities = async (req, res) => {
  const { cities } = req.body;
  console.log("Received cities", cities.length);

  if (!cities || !Array.isArray(cities) || cities.length === 0) {
    return res.status(400).json({ error: "An array of cities is required." });
  }

  const responses = [];

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

    generateCSV(responses);
    res.status(200).json({ data: responses });

  } catch (error) {
    console.error("Error processing city info:", error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
};

module.exports = {
  generateInfoForCities,
};
