const express = require('express');
const billingController = require('../controllers/billing.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Applica middleware di autenticazione a tutte le route
router.use(authMiddleware);

// Route per ottenere i costi del progetto
router.get('/costs', billingController.getProjectCosts);

module.exports = router; 