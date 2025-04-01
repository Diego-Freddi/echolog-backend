const express = require('express');
const router = express.Router();
const { 
  analyzeText, 
  analyzeTextMock, 
  getAnalysis, 
  getAnalysisHistory 
} = require('../controllers/analysis.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rotta mock non richiede autenticazione
router.post('/mock', analyzeTextMock);

// Tutte le altre route richiedono autenticazione
router.use(authMiddleware);

// Analisi del testo con Gemini
router.post('/', analyzeText);

// Recupera un'analisi specifica
router.get('/:id', getAnalysis);

// Recupera cronologia delle analisi
router.get('/', getAnalysisHistory);

module.exports = router; 