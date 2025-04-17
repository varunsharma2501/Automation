// routes/infoRoutes.js
const express = require('express');
const { generateInfoForCities } = require('../controllers/getCitiesInfo.js');
const {searchGoogle}=require("../controllers/scrapGoogleSearch")
const router = express.Router();

// POST route to handle multiple cities
router.post('/generateInfoForCities', generateInfoForCities);
router.post('/scrapeGoogleSearch',searchGoogle)

module.exports = router;
