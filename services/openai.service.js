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

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `
    You are a professional commercial vehicle installation researcher.
    
    Your tasks must follow these rules:
    - Only include real and verifiable companies. Never fabricate company names or websites.
    - Only include companies with active installation capabilities.
    - Always return a raw JavaScript array of JSON objects, without any markdown, code block formatting, explanations, or commentary.
    - Format the response strictly as: [
      { name: "...", services: "...", website: "...", source: [...] },
      ...
    ]
    `
        },
        {
          role: 'user',
          content: `
    Find up to 20 verified vehicle upfitters and installers in ${city} that specialize in police and emergency vehicles.
    
    Exclusion Criteria:
    - Exclude companies that only sell parts or do repairs without installation
    - Exclude those without explicit installation services
    - Exclude any company without a working website or LinkedIn profile
    
    Inclusion Criteria:
    - Prioritize businesses with 'fleet installation' or 'commercial upfitting' in their descriptions
    
    Use only trusted sources:
    - Google Maps, Google Search, Yelp, Yellow Pages, LinkedIn Company Pages, or state registries
    - Add the source in parentheses next to each data point (e.g., "LinkedIn", "Google Maps")
    
    Each object in the array should include:
    - name
    - services
    - website
    - source (as an array of strings)
    If fewer than 20 companies match, return as many as you can find.
    `
        }
      ]
    });
    

    const responseText = response.choices[0].message.content;
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


const enrichmentSystemPrompt = `
You are a professional business data researcher.

Guidelines:
- Search ONLY on Google, LinkedIn, Yellow Pages, Yelp, Google Maps, or state business registries.
- Never fabricate or guess any information.
- If data is not verifiable, return "NA" for that field.
- Your response must be a raw, clean JSON object. Do not include markdown, code blocks, or any explanation.
- Format strictly as: {
  name: "...",
  services: "...",
  website: "...",
  source: [...],
  contactDetails: "...",
  location: "..."
}
`;

const enrichUserPrompt = (companyData) => `
You will receive one verified commercial vehicle upfitter/installer entry.

Please enrich the object by adding:
- "contactDetails": Phone number or email
- "location": City, State

Only use publicly verifiable sources. Do not generate fake data.

Here is the entry:
${JSON.stringify(companyData, null, 2)}
`;


    const enrichedArray = [];

    for (const company of upfitters) {
      try {
        const prompt = enrichUserPrompt(company);
    
        const enrichmentResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          temperature: 0,
          messages: [
            { role: 'system', content: enrichmentSystemPrompt },
            { role: 'user', content: prompt }
          ]
        });
    
        const enrichedText = enrichmentResponse.choices[0].message.content;
        const enrichedCompany = cleanJson(enrichedText);
    
        if (enrichedCompany) {
          enrichedArray.push(enrichedCompany);
          // console.log(`✅ Enriched: ${enrichedCompany.name}`);
        } else {
          console.warn(`⚠️ Skipped due to invalid format: ${company.name}`);
        }
    
        await wait(1000); // optional throttle
      } catch (error) {
        console.error(`❌ Failed enrichment for ${company.name}:`, error.message);
      }
    }
    

    // console.log("\n🎉 Final Enriched Array:", enrichedArray);
    return enrichedArray;

  } catch (err) {
    console.error('Error fetching city info:', err.message);
    return [];
  }
};


// Example function call to test
// (async () => {
//   const city = 'New York City, NY';
//   const upfitters = await fetchCityInfo(city);
//   console.log('\n✅ Upfitters in', city, ':', upfitters);
// })();

module.exports = { fetchCityInfo };
