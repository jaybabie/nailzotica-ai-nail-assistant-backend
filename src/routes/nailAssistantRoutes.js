// src/routes/nailAssistantRoutes.js
console.log('✅ LOADED nailAssistantRoutes.js from:', __filename);

const express = require('express');
const router = express.Router();

// ✅ use the CONTROLLER (not the service)
const controllerPath = require.resolve('../controllers/nailAssistantController');
console.log('✅ nailAssistantController resolved path:', controllerPath);

const { generateDesign } = require('../controllers/nailAssistantController');

// POST /api/nail-assistant  (because app.js mounts '/api')
router.post('/nail-assistant', (req, res, next) => {
  console.log('✅ HIT POST /api/nail-assistant');
  return generateDesign(req, res, next);
});

module.exports = router;
