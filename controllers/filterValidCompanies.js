const axios = require("axios");
const openai = require("../config/openai.config");

/**
 * Checks if a URL is syntactically and actually valid (responds within timeout).
 */
async function isValidURL(url) {
  try {
    new URL(url); // Syntax check
    const response = await axios.get(url, { timeout: 5000 });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

/**
 * Filters out entries with invalid company URLs from the responses array.
 * @param {Array} responses - Array of upfitter info objects.
 * @returns {Promise<Array>} - Filtered array with only valid URLs.
 */
async function filterResponsesByValidURL(responses) {
  const filtered = [];

  for (const entry of responses) {
    const isValid = await isValidURL(entry.companyUrl);
    if (isValid) {
      filtered.push(entry);
    } else {
      // console.warn(`❌ Invalid URL for ${entry.name}: ${entry.companyUrl}`);
    }
  }

  return filtered;
}

const validateResponsesByCompanyUrl = async (responses) => {
  for (const item of responses) {
    const url = item.companyUrl;

    if (url && url !== "NA") {
      const prompt = `Visit the website: ${url}
Based on the information available on the site, determine if the company meets ALL the following criteria:
1. They perform installation or upfitting services specifically for police or emergency vehicles.
2. They specialize in fleet or commercial vehicle installations.
3. They are not just a product seller — they must actually perform installations themselves.

Return only a JSON object with a single key "isCompanyUrlValid" which should be either "valid" or "invalid".`;

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
        });

        const content = response.choices[0].message.content;

        try {
          let cleaned = content.trim();

          // Remove markdown code block if it exists
          if (cleaned.startsWith("```")) {
            cleaned = cleaned
              .replace(/```(?:json)?\s*([\s\S]*?)\s*```/, "$1")
              .trim();
          }

          const parsed = JSON.parse(cleaned);
          item.isCompanyUrlValid =
            parsed.isCompanyUrlValid === "valid" ? "valid" : "invalid";
          //
        } catch (parseErr) {
          console.error(
            `JSON parse error for URL: ${url}`,
            parseErr.message,
            "\nRaw GPT response:",
            content
          );
          item.isCompanyUrlValid = "invalid"; // default fallback
        }
      } catch (err) {
        console.error(`OpenAI error for ${url}:`, err.message);
        item.isCompanyUrlValid = "invalid";
      }
    } else {
      item.isCompanyUrlValid = "invalid";
    }
  }

  return responses;
};
module.exports = {
  isValidURL,
  filterResponsesByValidURL,
  validateResponsesByCompanyUrl,
};
