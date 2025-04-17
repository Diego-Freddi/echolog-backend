const express = require('express');
const router = express.Router();
const { upload, uploadAudio, getAudio, deleteAudio } = require('../controllers/audio.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Gestione delle richieste OPTIONS per CORS
const allowedOrigin = process.env.FRONTEND_URL || 'https://echolog-frontend-theta.vercel.app';

router.options('/:filename', (req, res) => {
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(204);
});

// Tutte le route richiedono autenticazione
router.use(authMiddleware);

// Upload file audio
router.post('/upload', upload.single('audio'), uploadAudio);

// Recupera file audio
router.get('/:filename', getAudio);

// Elimina file audio
router.delete('/:filename', deleteAudio);

module.exports = router;