const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// Get your ScraperAPI key from .env
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

const searchGoogle = async (req, res) => {
  // Get the search query from the route parameter
  const { searchQuery } = req.params;

  if (!searchQuery) {
    return res.status(400).json({ message: 'Search query is required' });
  }

  try {
    // Construct the Google search URL
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=10`;

    // ScraperAPI request URL
    const finalUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(searchUrl)}`;

    // Make the API call to ScraperAPI
    const response = await axios.get(finalUrl);
    const html = response.data;

    // Load the HTML response into Cheerio to extract links
    const $ = cheerio.load(html);
    const links = [];

    // Extract links from anchor tags and filter valid URLs
    $('a').each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.startsWith('http') && !href.includes('google.com')) {
        links.push(href);
      }
    });

    // Filter out duplicate links and limit to top 10
    const uniqueLinks = [...new Set(links)].slice(0, 10);

    // Send the links back as response
    res.status(200).json({ links: uniqueLinks });
  } catch (err) {
    console.error('Scraping error:', err.message);
    res.status(500).json({ message: 'Failed to fetch search results' });
  }
};

module.exports = {
  searchGoogle,
};
