const speech = require('@google-cloud/speech');
const path = require('path');
const fs = require('fs');
const { uploadToGCS } = require('../utils/gcsUploader');

// Inizializzazione del client Speech-to-Text
const client = new speech.SpeechClient();

/**
 * Configura le opzioni di base per la trascrizione
 * @param {Object} file - File audio
 * @returns {Object} Configurazione per Speech-to-Text
 */
const getTranscriptionConfig = (file) => {
  // Determina l'encoding in base al tipo di file
  let encoding = 'MP3';
  if (file.mimetype === 'audio/wav') {
    encoding = 'LINEAR16';
  }

  return {
    encoding: encoding,
    sampleRateHertz: 44100,  // Cambiato da 16000 a 44100 per supportare file standard
    languageCode: 'it-IT',
    enableAutomaticPunctuation: true,
    model: 'default',
    useEnhanced: true,
    enableWordTimeOffsets: true,
  };
};

/**
 * Gestisce la trascrizione di un file audio
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const transcribeAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'Nessun file audio fornito',
        details: 'È necessario fornire un file audio da trascrivere'
      });
    }

    console.log('File ricevuto:', {
      nome: req.file.originalname,
      tipo: req.file.mimetype,
      dimensione: req.file.size,
      percorso: req.file.path
    });

    // 1. Upload su GCS
    const destinationFileName = `${Date.now()}-${req.file.originalname}`;
    const gcsUri = await uploadToGCS(req.file.path, destinationFileName);
    console.log('File caricato su GCS:', gcsUri);

    // 2. Prepara la richiesta per Speech-to-Text
    const config = getTranscriptionConfig(req.file);
    const request = {
      audio: { uri: gcsUri },
      config: config,
    };

    console.log('Configurazione trascrizione:', {
      encoding: config.encoding,
      sampleRate: config.sampleRateHertz,
      language: config.languageCode,
      mimeType: req.file.mimetype,
      gcsUri: gcsUri
    });

    // 3. Avvia la trascrizione
    console.log('Avvio richiesta di trascrizione...');
    const [operation] = await client.longRunningRecognize(request);
    console.log('Trascrizione avviata, operationId:', operation.name);

    // 4. Pulisci il file temporaneo locale
    fs.unlinkSync(req.file.path);

    // 5. Restituisci l'operationId al client
    res.status(200).json({
      message: 'Trascrizione avviata con successo',
      operationId: operation.name,
      gcsUri: gcsUri
    });

  } catch (error) {
    console.error('Errore dettagliato durante la trascrizione:', error);
    console.error('Stack trace:', error.stack);

    // Pulisci il file temporaneo in caso di errore
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Errore durante la trascrizione',
      details: error.message,
      stack: error.stack
    });
  }
};

/**
 * Verifica lo stato di una trascrizione in corso
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const getTranscriptionStatus = async (req, res) => {
  try {
    const { operationId } = req.params;

    if (!operationId) {
      return res.status(400).json({
        error: 'ID operazione non fornito',
        details: 'È necessario fornire l\'ID dell\'operazione da verificare'
      });
    }

    console.log('Controllo stato per operationId:', operationId);
    const operation = await client.checkLongRunningRecognizeProgress(operationId);
    console.log('Stato operazione:', operation);
    
    if (operation.done) {
      if (operation.error) {
        console.error('Errore nella trascrizione:', operation.error);
        return res.status(500).json({
          status: 'failed',
          error: operation.error.message
        });
      }

      if (!operation.result || !operation.result.results || operation.result.results.length === 0) {
        console.error('Nessun risultato trovato nella trascrizione');
        return res.status(500).json({
          status: 'failed',
          error: 'Nessun risultato trovato nella trascrizione'
        });
      }

      const transcription = operation.result.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      console.log('Trascrizione completata:', transcription);
      return res.status(200).json({
        status: 'completed',
        transcription: transcription
      });
    }

    console.log('Trascrizione ancora in corso...');
    res.status(200).json({
      status: 'in_progress',
      metadata: operation.metadata
    });

  } catch (error) {
    console.error('Errore nel controllo stato trascrizione:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      error: 'Errore nel controllo stato trascrizione',
      details: error.message,
      stack: error.stack
    });
  }
};

module.exports = {
  transcribeAudio,
  getTranscriptionStatus
};