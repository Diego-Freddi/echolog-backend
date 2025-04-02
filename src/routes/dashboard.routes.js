const express = require('express');
const router = express.Router();
const { getDashboardStats, getTranscriptionHistory } = require('../controllers/dashboard.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Tutte le route richiedono autenticazione
router.use(authMiddleware);

// Statistiche per la dashboard
router.get('/stats', getDashboardStats);

// Cronologia delle trascrizioni
router.get('/history', getTranscriptionHistory);

module.exports = router; 