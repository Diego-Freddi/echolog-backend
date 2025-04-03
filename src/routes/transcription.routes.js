const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { transcribeAudio, getTranscriptionStatus, deleteTranscription } = require('../controllers/transcription.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Configurazione multer per i file audio
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/temp');
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    cb(null, `${uniqueId}${path.extname(file.originalname)}`);
  }
});

// Configurazione upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/wav', 'audio/mp3', 'audio/mpeg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato file non supportato. Usa WAV o MP3.'));
    }
  }
});

// Tutte le route richiedono autenticazione
router.use(authMiddleware);

// Route per la trascrizione
router.post('/', upload.single('audio'), transcribeAudio);

// Route per controllare lo stato della trascrizione
router.get('/status/:operationId', getTranscriptionStatus);

// Route per eliminare una trascrizione e i dati associati
router.delete('/:id', deleteTranscription);

module.exports = router;