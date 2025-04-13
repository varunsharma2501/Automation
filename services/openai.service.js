const openai = require('../config/openai.config');

const fetchCityInfo = async (city) => {
  const prompt = `
  Give me a list of all the installers and upfitters for police cars in ${city}. 
  Return the response strictly as a JSON array of objects with the format:
  [{ "name": "...", "location": "...", "overview": "...", "contact": "...", "companyUrl": "..." }]
  Do not wrap the JSON in quotes or markdown formatting.
`;


  const completion =await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = completion.choices[0].message.content;

  let parsed;
  try {
    parsed = JSON.parse(responseText); // If it's already a raw array
    if (Array.isArray(parsed)) return parsed;
    console.log("Parsed array value is ",parsed)
    // If it's an object with a nested array (e.g., { upfitters: [...] })
    if (parsed.upfitters && Array.isArray(parsed.upfitters)) return parsed.upfitters;

    return []; // fallback
  } catch (err) {
    try {
      // Try parsing again if it's a stringified JSON (like from curl response)
      const nestedParsed = JSON.parse(JSON.parse(`"${responseText}"`));
      if (Array.isArray(nestedParsed)) return nestedParsed;
      if (nestedParsed.upfitters && Array.isArray(nestedParsed.upfitters)) return nestedParsed.upfitters;
    } catch (nestedErr) {
      console.error(`Failed to parse response for ${city}:`, nestedErr.message);
      return [];
    }
  }
};

// Dummy function call to test
// (async () => {
//   const city = 'Andalusia, AL';
//   const upfitters = await fetchCityInfo(city);
//   console.log(`\n✅ Upfitters in ${city}:\n`, upfitters);
// })();

module.exports = { fetchCityInfo };
