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

const search5 = `For each company in the list below, search online and try to find:
- A working phone number
- The owner or founder's name

Use publicly available data from directories, official websites, or LinkedIn.

If a field cannot be found after a reasonable search, then return "NA". Avoid guessing or making up names.

Return the results in clean JSON format like this:
[
  {
    "name": "Upfitter Name",
    "phone": "Phone Number or NA",
    "ownerName": "Owner Name or NA"
  }
]

Only respond with a clean JSON array. No explanation, markdown, or extra notes.

List:
${responseText}`;


const response5 = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: search5 }],
});

responseText = response5.choices[0].message.content;
// console.log("Step 5 response:", responseText);

try {
  upfitters = JSON.parse(responseText);
} catch (err) {
  console.error('Error parsing response from Step 5:', err.message);
}

const search6 = `For each company in the list below, search online (via directories, maps, websites, LinkedIn) and try to find:
- Location (City, State or full address — whichever is available)
- A short, real description of what the company does (based on website or online profiles)

If either field cannot be confidently identified, use "NA" — but only if truly unavailable.

Format:
[
  {
    "name": "Upfitter Name",
    "phone": "Phone Number or NA",
    "ownerName": "Owner Name or NA",
    "location": "City, State or Address or NA",
    "description": "Short actual description or NA"
  }
]

Respond only with the clean JSON. No markdown or extra text.

List: ${JSON.stringify(upfitters, null, 2)}`;


const response6 = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: search6 }],
});

responseText = response6.choices[0].message.content;
// console.log("Step 6 response:", responseText);

try {
  upfitters = JSON.parse(responseText);
} catch (err) {
  console.error('Error parsing response from Step 6:', err.message);
}


const search7 = `For each company in the list below, find their official website (home page or best match). Return only:
- The raw, clickable URL (e.g., "https://example.com")

Do not wrap the URL in markdown or HTML.

If no website is found after reasonable searching, use "NA".

Return in this format:
[
  {
    "name": "Upfitter Name",
    "phone": "Phone Number or NA",
    "ownerName": "Owner Name or NA",
    "location": "City, State or Address or NA",
    "description": "Short actual description or NA",
    "companyUrl": "URL or NA"
  }
]

Only respond with the valid JSON array.

List: ${JSON.stringify(upfitters, null, 2)}`;


const response7 = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: search7 }],
});

responseText = response7.choices[0].message.content;
// console.log("Step 7 response:", responseText);

try {
  upfitters = JSON.parse(responseText);
  // Just in case: strip HTML tags from the URL
  upfitters = upfitters.map(u => ({
    ...u,
    companyUrl: u.companyUrl.replace(/<[^>]+>/g, '')
  }));
} catch (err) {
  console.error('Error parsing response from Step 7:', err.message);
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
