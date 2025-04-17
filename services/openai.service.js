const openai = require('../config/openai.config');

// Function to perform sequential searches with filtering
const fetchCityInfo = async (city) => {
  try {
    let upfitters = [];

    // Step 1: Directly ask for a list of 20 installers and upfitters for police and emergency vehicles in the city
const search1 = `Give me a list of 20 installers and upfitters that do police and emergency vehicles in ${city}.`;

const response1 = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: search1 }],
});

let responseText = response1.choices[0].message.content;
// console.log('Raw Response from Step 1:', responseText);  // Log the raw response

// Step 2: Filter out places that don't do installations
const search2 = `
From the list below, filter out any companies that do not perform installations.
Return the updated list of installers as a plain list of names, one per line.

List:
${responseText}
`;

const response2 = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: search2 }],
});

responseText = response2.choices[0].message.content;
// console.log('Raw Response from Step 2:', responseText);  // Log the raw response


// Step 3: Filter only for companies that do fleet and commercial installations
const search3 = `
From the list below, filter only the companies that specialize in fleet and commercial installations.
Return the updated list of fleet/commercial installers as a plain list of names, one per line.

List:
${responseText}
`;

const response3 = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: search3 }],
});

responseText = response3.choices[0].message.content;
// console.log('Raw Response from Step 3:', responseText);  // Log the raw response


// Step 4: Filter out companies that only sell products and don't do installations
const search4 = `
From the list below, filter out any companies that only sell products and do not perform installations themselves.
Return the updated list of companies that perform installations as a plain list of names, one per line.

List:
${responseText}  // Directly use the responseText from Step 3
`;

const response4 = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: search4 }],
});

responseText = response4.choices[0].message.content;
// console.log('Raw Response from Step 4:', responseText);  // Log the raw response

// Step 5: Add phone numbers, owner names, location, and a short description
const search5 = `For each upfitter in the list below, add the following additional information **only if available**:
- Phone number
- Owner name
- Location (City, State or full address)
- A short, real description about what the company does

If a field is not available, set its value to "NA".

At the end, return the final list in the following JSON format:

[
  { 
    "name": "Upfitter Name", 
    "phone": "Phone Number or NA", 
    "ownerName": "Owner Name or NA", 
    "location": "City, State or Address or NA", 
    "description": "Short actual description or NA"
  }
]

Only return a clean JSON array — no extra formatting, bullet points, or explanations.

List:
${responseText}
`;


const response5 = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: search5 }],
});

responseText = response5.choices[0].message.content;
// console.log('Raw Response from Step 5:', responseText);  // Log the raw response

try {
  const parsed = JSON.parse(responseText);
  upfitters = parsed;
} catch (err) {
  console.error('Error parsing response from Step 5:', err.message);
}

// Step 6: Add clickable URLs to each record
const search6 = `From the list below, for each company, please provide a new field "companyUrl" that contains ONLY the raw URL (without any HTML tags). 

List:
${JSON.stringify(upfitters, null, 2)}
`;

const response6 = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: search6 }],
});

responseText = response6.choices[0].message.content;
// console.log('Raw Response from Step 6:', responseText);  // Log the raw response

try {
  // Parse the raw response
  let parsed = JSON.parse(responseText);

  // Clean up any HTML tags if needed (not needed if OpenAI responds correctly)
  parsed = parsed.map(upfitter => ({
    ...upfitter,
    companyUrl: upfitter.companyUrl.replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
  }));

  upfitters = parsed;
} catch (err) {
  console.error('Error parsing response from Step 6:', err.message);
}


return upfitters.map(upfitter => ({
  name: upfitter.name,
  phone: upfitter.phone,
  ownerName: upfitter.ownerName,
  description: upfitter.description,
  location: upfitter.location,
  companyUrl: upfitter.companyUrl,
}));


  } catch (err) {
    console.error('Error fetching city info:', err.message);
    return [];
  }
};

// Example function call to test
// (async () => {
//   const city = 'Andalusia, AL';
//   const upfitters = await fetchCityInfo(city);
//   console.log('\n✅ Upfitters in', city, ':', upfitters);
// })();

module.exports = { fetchCityInfo };
