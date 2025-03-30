const express = require('express');
const router = express.Router();
const { upload, uploadAudio, getAudio, deleteAudio } = require('../controllers/audio.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Tutte le route richiedono autenticazione
router.use(authMiddleware);

// Upload file audio
router.post('/upload', upload.single('audio'), uploadAudio);

// Recupera file audio
router.get('/:filename', getAudio);

// Elimina file audio
router.delete('/:filename', deleteAudio);

module.exports = router; 