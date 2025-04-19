const openai = require('../config/openai.config');

// Helper to safely parse JSON (handles code blocks etc.)
const cleanJson = (text) => {
  try {
    // Remove code block wrappers like ```json or ```javascript
    const cleaned = text
      .replace(/```(?:json|javascript)?/gi, '') // remove opening triple backticks with optional lang
      .replace(/```/g, '')                      // remove closing triple backticks
      .trim();
    // console.log("cleaned", cleaned); // helpful for debugging
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("JSON parse failed:", err.message);
    console.error("Original Text:\n", text); // helpful for debugging
    return null;
  }
};


// Optional delay function to avoid rate limiting
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to perform improved upfitter search using enhanced prompt
const fetchCityInfo = async (city) => {
  try {
    let upfitters = [];

    const improvedPrompt = `
Act as a commercial vehicle installation researcher. Try to generate a list of 20 verified vehicle upfitters and installers in ${city} that work on police and emergency vehicles. Use the following parameters:

Exclusion Criteria:
- Remove any companies without explicit installation capabilities
- Eliminate firms focused only on parts sales/repairs without installation services

Inclusion Requirements:
- Prioritize companies with 'fleet installation' or 'commercial upfitting' in service descriptions
- Include only businesses with active websites/LinkedIn profiles

Important:
1. Extract ONLY from: Google Maps and Google Search, Yellow Pages, Yelp, LinkedIn Company Search, and state business registries. Include source abbreviations in parentheses after each data point. Do not add fake or made-up company names just to match the count — include only real, verifiable businesses.
2. Return the response as a JavaScript array of objects.
3. Each object should have the following fields: 
   - name 
   - services 
   - website 
   - source 
4.If not able to find 20 companies, return as many as you can find.

   Return only the raw JSON array with no markdown, code block, or language formatting.
`;

    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: improvedPrompt }],
    });

    const responseText = initialResponse.choices[0].message.content;
    upfitters = cleanJson(responseText) || [];

    // console.log(`✅ Found ${upfitters.length} upfitters in ${city}\n`);

    // Enrichment prompt template
    const enrichPrompt = (companyData) => `
You're a business data researcher. I will give you one verified commercial vehicle upfitter/installers entry. Your task is:

1. Use the available data to search ONLY on Google, LinkedIn, Yellow Pages, Yelp, Google Maps, or state business registries.
2. Add the following fields:
   - "contactDetails": (Phone number or email of the company. If not found, return "NA")
   - "location": (City, State of the business. If not found, return "NA")
3. DO NOT make up or hallucinate any details. Leave the fields as "NA" if no verifiable info is found.
4.Return only the raw JSON object with no markdown, code block, or language formatting.
Here is the entry:
${JSON.stringify(companyData, null, 2)}
`;

    const enrichedArray = [];

    for (const company of upfitters) {
      try {
        const prompt = enrichPrompt(company);

        const enrichmentResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
        });

        const enrichedText = enrichmentResponse.choices[0].message.content;
        const enrichedCompany = cleanJson(enrichedText);

        if (enrichedCompany) {
          enrichedArray.push(enrichedCompany);
          // console.log(`✅ Enriched: ${enrichedCompany.name}`);
        } else {
          console.warn(`⚠️ Skipped due to invalid format: ${company.name}`);
        }

        await wait(1000); // throttle between requests (adjust if needed)
      } catch (error) {
        console.error(`❌ Failed enrichment for ${company.name}:`, error.message);
      }
    }

    console.log("\n🎉 Final Enriched Array:", enrichedArray);
    return enrichedArray;

  } catch (err) {
    console.error('Error fetching city info:', err.message);
    return [];
  }
};


// Example function call to test
(async () => {
  const city = 'New York City, NY';
  const upfitters = await fetchCityInfo(city);
  console.log('\n✅ Upfitters in', city, ':', upfitters);
})();

module.exports = { fetchCityInfo };
