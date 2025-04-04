const express = require('express');
const router = express.Router();
const { 
  transcribeAudio, 
  getTranscriptionStatus,
  deleteTranscription,
  transcribeFromText,
  transcribeFromFile 
} = require('../controllers/transcription.controller');
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middleware/auth.middleware');

// Configurazione di Multer per file audio e documenti
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Configurazione dell'upload per file audio
const uploadAudio = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Formato file non supportato. Sono accettati solo file audio.'), false);
    }
  }
});

// Configurazione dell'upload per file di testo
const uploadDocument = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const fileExt = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.docx', '.doc', '.txt'];
    
    if (allowedExts.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Formato file non supportato. Formati accettati: PDF, DOCX, DOC, TXT.'), false);
    }
  }
});

// Middleware applicato a tutte le rotte
router.use(authMiddleware);

// Rotta per iniziare la trascrizione di un file audio
router.post('/', uploadAudio.single('audio'), transcribeAudio);

// Rotta per verificare lo stato di una trascrizione in corso
router.get('/status/:operationId', getTranscriptionStatus);

// Rotta per eliminare una trascrizione
router.delete('/:id', deleteTranscription);

// Rotta per trascrizione da testo diretto
router.post('/fromText', transcribeFromText);

// Rotta per trascrizione da file (PDF, DOCX, TXT)
router.post('/fromFile', uploadDocument.single('document'), transcribeFromFile);

module.exports = router;