// src/routes/nailAssistantRoutes.js
console.log('✅ LOADED nailAssistantRoutes.js from:', __filename);

const express = require('express');
const router = express.Router();

// Optional: keep this proof log
const servicePath = require.resolve('../services/nailAssistantService');
console.log('✅ nailAssistantService resolved path:', servicePath);

// ✅ USE THE CONTROLLER (this is where generationId stamping lives)
const nailAssistantController = require('../controllers/nailAssistantController');

// POST /api/nail-assistant
router.post(
  '/nail-assistant',
  (req, _res, next) => {
    console.log('✅ HIT POST /api/nail-assistant');
    console.log('🧾 BODY:', req.body);
    next();
  },
  nailAssistantController.generateDesign
);

module.exports = router;
