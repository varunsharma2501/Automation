const axios = require('axios');
require('dotenv').config();
async function searchSerper(query) {
  try {
    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://google.serper.dev/search',
      headers: { 
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({ q: query })
    };

    const response = await axios.request(config);
    return response.data;
  } catch (error) {
    console.error("Error in Serper API:", error.response?.data || error.message);
    throw new Error("Serper API failed");
  }
}

module.exports = { searchSerper };
