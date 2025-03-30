const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configurazione multer per il salvataggio temporaneo dei file audio
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/audio';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueId = uuidv4();
    cb(null, `${uniqueId}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato file non supportato. Usa WAV o MP3.'), false);
    }
  }
});

const uploadAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nessun file audio caricato' });
    }

    // Qui in futuro implementeremo l'upload su Google Cloud Storage
    const audioUrl = `/uploads/audio/${req.file.filename}`;

    res.status(200).json({
      message: 'File audio caricato con successo',
      audioUrl: audioUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Errore nel caricamento del file:', error);
    res.status(500).json({ error: 'Errore nel caricamento del file audio' });
  }
};

const getAudio = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../../uploads/audio', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File audio non trovato' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Errore nel recupero del file:', error);
    res.status(500).json({ error: 'Errore nel recupero del file audio' });
  }
};

const deleteAudio = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../../uploads/audio', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File audio non trovato' });
    }

    fs.unlinkSync(filePath);
    res.status(200).json({ message: 'File audio eliminato con successo' });
  } catch (error) {
    console.error('Errore nell\'eliminazione del file:', error);
    res.status(500).json({ error: 'Errore nell\'eliminazione del file audio' });
  }
};

module.exports = {
  upload,
  uploadAudio,
  getAudio,
  deleteAudio
}; 