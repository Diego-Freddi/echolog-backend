const speech = require('@google-cloud/speech');
const path = require('path');
const fs = require('fs');

// Inizializzazione del client Speech-to-Text
const client = new speech.SpeechClient();

/**
 * Configura le opzioni di base per la trascrizione
 * @param {Object} options - Opzioni personalizzate (opzionale)
 * @returns {Object} Configurazione per Speech-to-Text
 */
const getTranscriptionConfig = (options = {}) => ({
  encoding: options.encoding || 'LINEAR16',
  sampleRateHertz: options.sampleRateHertz || 16000,
  languageCode: options.languageCode || 'it-IT',
  enableAutomaticPunctuation: true,
  model: 'default', // Usiamo il modello default per ora
  useEnhanced: true,
  enableWordTimeOffsets: true,
});

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

    console.log('Inizio trascrizione per:', req.file.originalname);

    // Leggi il file audio
    const audioBytes = fs.readFileSync(req.file.path).toString('base64');

    // Prepara la richiesta per Speech-to-Text
    const audio = {
      content: audioBytes,
    };

    const config = getTranscriptionConfig();
    const request = {
      audio: audio,
      config: config,
    };

    console.log('Configurazione trascrizione:', {
      encoding: config.encoding,
      sampleRate: config.sampleRateHertz,
      language: config.languageCode
    });

    // Avvia la trascrizione
    const [operation] = await client.longRunningRecognize(request);
    console.log('Trascrizione avviata, operationId:', operation.name);

    // Pulisci il file temporaneo
    fs.unlinkSync(req.file.path);

    // Restituisci l'operationId al client
    res.status(200).json({
      message: 'Trascrizione avviata con successo',
      operationId: operation.name
    });

  } catch (error) {
    console.error('Errore durante la trascrizione:', error);

    // Pulisci il file temporaneo in caso di errore
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Errore durante la trascrizione',
      details: error.message
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
        .join(' ');

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
    res.status(500).json({
      error: 'Errore nel controllo stato trascrizione',
      details: error.message
    });
  }
};

module.exports = {
  transcribeAudio,
  getTranscriptionStatus
};