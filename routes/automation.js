// routes/infoRoutes.js
const express = require('express');
const { generateInfoForCities } = require('../controllers/getCitiesInfo.js');

const router = express.Router();

// POST route to handle multiple cities
router.post('/generateInfoForCities', generateInfoForCities);

module.exports = router;
