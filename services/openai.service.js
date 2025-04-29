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
    console.log("city",city)
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
    Find list of 20 verified vehicle upfitters and installers located specifically in ${city}, US that specialize in police and emergency vehicles. Only include companies that clearly list their services in ${city}, and exclude any results outside this city.
    
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
    console.log("RESPONSE-TEXT", responseText)
    upfitters = cleanJson(responseText) || [];

    // console.log(`✅ Found ${upfitters.length} upfitters in ${city}\n`);

    // Enrichment prompt template


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
You will receive one verified commercial vehicle upfitter/installer entry in ${city}.

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



async function isUpfitterBusiness(title, snippet, link) {
  const prompt = `
  You are a strict filter for business websites.
  
  Given a link with its title and description, decide **only** if it belongs to a company that directly performs vehicle upfitting services — such as police car outfitting, fleet vehicle installations, van conversions, or commercial/emergency vehicle customization.
  
  The site must clearly belong to a **business that performs upfitting work**, not directories, review platforms, job boards, articles, marketplaces, forums, or resellers.
  
  Examples of what should be marked as **invalid**:
  - Godaddy parked domains or builder pages
  - LinkedIn, Glassdoor, Yelp, or any job/review site
  - News articles, Wikipedia, blogs
  - Dealer listings or parts suppliers that don't do installations
  - Product-only catalog pages
  
  Examples of what should be **valid**:
  - A company website showing upfitting services or completed fleet builds
  - Service providers with installation galleries, contact info, and service offerings
  
  Now evaluate:
  
  Title: ${title}
  Link: ${link}
  Snippet: ${snippet}
  
  Reply strictly with one of:
  - valid
  - invalid
  
  Answer only with: valid or invalid.
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  return response.choices[0].message.content.trim().toLowerCase() === "valid";
}


async function extractCompanyDetails({ scrapedText, title, snippet, link }) {
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
Only return this JSON object. Do not add any extra text.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are an expert business data extractor. ONLY return a valid JSON object with double quotes. No markdown or extra text.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
    });

    let content = response.choices[0].message.content.trim();

    // 🧼 Step 1: Extract likely JSON block using regex
    const jsonMatch = content.match(/{[\s\S]*}/);
    if (!jsonMatch) throw new Error("No valid JSON block found in GPT response");

    let jsonText = jsonMatch[0];

    // 🧽 Step 2: Clean up common formatting issues
    jsonText = jsonText
      .replace(/[“”]/g, '"')       // Replace curly quotes
      .replace(/,\s*}/g, '}')      // Remove trailing commas
      .replace(/,\s*]/g, ']')      // Remove trailing commas in arrays
      .replace(/\\"/g, '"')        // Fix escaped quotes

    // ✅ Step 3: Try parsing the cleaned JSON
    const extractedData = JSON.parse(jsonText);

    // 🛠 Step 4: Apply fallbacks
    extractedData.name = extractedData.name === 'NA' ? title : extractedData.name;
    extractedData.description = extractedData.description === 'NA' ? snippet : extractedData.description;
    extractedData.companyUrl = link;

    return extractedData;

  } catch (error) {
    console.error('❌ Error extracting company details:', error.message);

    return {
      name: title || 'NA',
      contactDetails: 'NA',
      location: 'NA',
      description: snippet || 'NA',
      ownerName: 'NA',
      companyUrl: link || 'NA'
    };
  }
}

module.exports = {
  isUpfitterBusiness,
  extractCompanyDetails,
  fetchCityInfo
};


