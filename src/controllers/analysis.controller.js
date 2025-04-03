const { VertexAI } = require('@google-cloud/vertexai');
const path = require('path');
const Analysis = require('../models/analysis.model');
const Transcription = require('../models/transcription.model');
require('dotenv').config();

// Inizializzazione del client Vertex AI
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_PROJECT_ID || 'echolog-455210',
  location: process.env.GOOGLE_LOCATION || 'us-central1',
});

// Ottieni il modello generativo Gemini
const model = vertexAI.preview.getGenerativeModel({
  model: process.env.GEMINI_MODEL || 'gemini-pro',
});

/**
 * Template del prompt per l'analisi del testo
 */
const ANALYSIS_PROMPT = `
Sei un assistente specializzato nell'analisi di testi trascritti da audio.

Analizza il seguente testo trascritto e:
1. Crea un riassunto conciso (massimo 3 paragrafi) dei punti principali
2. Identifica e organizza il contenuto in sezioni tematiche (da 2 a 5 sezioni)
3. Evidenzia fino a 10 parole chiave o concetti importanti
4. Identifica il tono generale del discorso (formale, informale, tecnico, divulgativo, etc.)

Testo da analizzare:
---
{transcriptionText}
---

Rispondi in formato JSON seguendo esattamente questa struttura:
{
  "summary": "Riassunto dei punti principali",
  "tone": "Tono generale del discorso",
  "keywords": ["parola1", "parola2", "concetto1", ...],
  "sections": [
    {
      "title": "Titolo della sezione",
      "content": "Contenuto della sezione con i punti principali",
      "keywords": ["parola chiave relativa alla sezione"]
    }
  ]
}

NON includere spiegazioni o introduzioni. Rispondi SOLO con JSON formattato correttamente.
`;

/**
 * Analizza il testo trascritto usando Gemini
 * @param {Request} req - Request object con il testo trascritto
 * @param {Response} res - Response object
 */
const analyzeText = async (req, res) => {
  try {
    const { text, transcriptionId, forceReanalysis } = req.body;
    const userId = req.user._id; // Ottenuto dal middleware di autenticazione

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: 'Testo mancante',
        details: 'È necessario fornire il testo da analizzare'
      });
    }

    if (!transcriptionId) {
      return res.status(400).json({
        error: 'ID trascrizione mancante',
        details: 'È necessario fornire l\'ID della trascrizione'
      });
    }

    console.log('Inizio analisi del testo (primi 100 caratteri):', text.substring(0, 100) + '...');
    
    // Cerca la Transcription nel database
    let transcription;
    try {
      transcription = await Transcription.findById(transcriptionId);
      
      if (!transcription) {
        return res.status(404).json({
          error: 'Trascrizione non trovata',
          details: `Nessuna trascrizione trovata con ID ${transcriptionId}`
        });
      }
    } catch (error) {
      return res.status(400).json({
        error: 'ID trascrizione non valido',
        details: 'Il formato dell\'ID trascrizione fornito non è valido'
      });
    }
    
    // Controlla se esiste già un'analisi per questa trascrizione
    const existingAnalysis = await Analysis.findOne({ 
      userId: userId,
      transcription: transcription._id
    });

    // Se esiste un'analisi e non è stata richiesta una rianalisi forzata, restituisci quella esistente
    if (existingAnalysis && !forceReanalysis) {
      console.log('Analisi esistente trovata per la trascrizione:', transcriptionId);
      return res.status(200).json({
        message: 'Analisi già esistente',
        analysis: {
          summary: existingAnalysis.summary,
          tone: existingAnalysis.tone,
          keywords: existingAnalysis.keywords,
          sections: existingAnalysis.sections
        },
        id: existingAnalysis._id,
        createdAt: existingAnalysis.createdAt,
        transcriptionId: transcription._id
      });
    }

    // Se è stata richiesta una rianalisi forzata e l'analisi esiste già, elimina quella precedente
    if (existingAnalysis && forceReanalysis) {
      console.log('Aggiornamento analisi richiesto, eliminazione analisi precedente...');
      await Analysis.deleteOne({ _id: existingAnalysis._id });
    }

    // Prepara il prompt con il testo da analizzare
    const prompt = ANALYSIS_PROMPT.replace('{transcriptionText}', text);

    // Impostazioni di generazione per Gemini
    const generationConfig = {
      temperature: 0.2,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '4096'),
    };

    console.log('Invio richiesta a Gemini...');
    
    // Genera l'analisi con Gemini
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });

    // Estrai il testo dalla risposta
    const response = await result.response;
    const analysisText = response.candidates[0].content.parts[0].text;

    console.log('Analisi completata, elaborazione risposta...');

    let analysisJson;
    try {
      // Pulisci la risposta e converti in JSON
      const cleanedText = analysisText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      analysisJson = JSON.parse(cleanedText);
      
      console.log('Analisi elaborata con successo');
    } catch (parseError) {
      console.error('Errore nella conversione della risposta in JSON:', parseError);
      console.log('Risposta grezza:', analysisText);
      
      return res.status(500).json({
        error: 'Errore nell\'elaborazione della risposta',
        details: 'La risposta dell\'AI non è in formato JSON valido',
        rawResponse: analysisText
      });
    }

    // Crea il nuovo oggetto Analysis
    const newAnalysis = new Analysis({
      userId: userId,
      transcription: transcription._id,
      summary: analysisJson.summary,
      tone: analysisJson.tone,
      keywords: analysisJson.keywords,
      sections: analysisJson.sections,
      rawText: text
    });

    await newAnalysis.save();
    console.log('Analisi salvata nel database con ID:', newAnalysis._id);

    res.status(200).json({
      message: 'Analisi completata con successo',
      analysis: analysisJson,
      id: newAnalysis._id,
      createdAt: newAnalysis.createdAt,
      transcriptionId: transcription._id
    });
  } catch (error) {
    console.error('Errore durante l\'analisi del testo:', error);
    
    res.status(500).json({
      error: 'Errore durante l\'analisi del testo',
      details: error.message
    });
  }
};

/**
 * Recupera un'analisi esistente
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const getAnalysis = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Trova l'analisi e popola solo i campi necessari della trascrizione
    const analysis = await Analysis.findOne({ 
      _id: id,
      userId: userId
    }).populate('transcription', 'fullText createdAt recordingId');

    if (!analysis) {
      return res.status(404).json({
        error: 'Analisi non trovata',
        details: 'L\'analisi richiesta non esiste o non appartiene all\'utente'
      });
    }

    // Verifica se abbiamo una trascrizione associata
    const transcriptionId = analysis.transcription ? analysis.transcription._id : null;
    const transcriptionText = analysis.transcription ? analysis.transcription.fullText : '';

    res.status(200).json({
      analysis: {
        summary: analysis.summary,
        tone: analysis.tone,
        keywords: analysis.keywords,
        sections: analysis.sections
      },
      id: analysis._id,
      createdAt: analysis.createdAt,
      transcriptionId: transcriptionId,
      transcriptionText: transcriptionText
    });
  } catch (error) {
    console.error('Errore nel recupero dell\'analisi:', error);
    
    // Gestione specifica dell'errore di cast (ID non valido)
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'ID analisi non valido',
        details: 'Il formato dell\'ID fornito non è valido'
      });
    }
    
    res.status(500).json({
      error: 'Errore nel recupero dell\'analisi',
      details: error.message
    });
  }
};

/**
 * Recupera la cronologia delle analisi dell'utente
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const getAnalysisHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;
    const skip = parseInt(req.query.skip) || 0;

    // Trova tutte le analisi con populate della trascrizione per ottenere informazioni addizionali
    const analyses = await Analysis.find({ userId })
      .populate('transcription', 'fullText createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('summary keywords createdAt transcription');

    // Trasforma i risultati nel formato atteso dal frontend
    const transformedAnalyses = analyses.map(analysis => ({
      _id: analysis._id,
      summary: analysis.summary,
      keywords: analysis.keywords,
      createdAt: analysis.createdAt,
      transcriptionId: analysis.transcription._id,
      transcriptionDate: analysis.transcription.createdAt,
      textPreview: analysis.transcription.fullText
        ? analysis.transcription.fullText.substring(0, 100) + '...'
        : ''
    }));

    const total = await Analysis.countDocuments({ userId });

    res.status(200).json({
      analyses: transformedAnalyses,
      total,
      limit,
      skip
    });
  } catch (error) {
    console.error('Errore nel recupero della cronologia:', error);
    
    res.status(500).json({
      error: 'Errore nel recupero della cronologia',
      details: error.message
    });
  }
};

/**
 * Versione di test dell'analisi che restituisce un risultato fisso
 * Utile per sviluppo frontend senza consumare API
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const analyzeTextMock = (req, res) => {
  // Ritardo simulato di 1-2 secondi per simulare la risposta API
  const delay = Math.floor(Math.random() * 1000) + 1000;
  
  console.log('Richiesta analisi mock ricevuta, risposta in', delay, 'ms');
  
  setTimeout(() => {
    res.status(200).json({
      message: 'Analisi completata con successo (MOCK)',
      analysis: {
        summary: "Questa è una conversazione su un progetto software con discussioni sulle tecnologie e sulle scadenze. Il team sta valutando l'uso di React e Node.js per lo sviluppo dell'applicazione.",
        tone: "Professionale",
        keywords: ["progetto", "sviluppo", "React", "Node.js", "scadenza", "implementazione"],
        sections: [
          {
            title: "Discussione Tecnologica",
            keywords: ["React", "Node.js", "frontend", "backend"],
            content: "La discussione si concentra principalmente sulla scelta delle tecnologie per il progetto."
          },
          {
            title: "Pianificazione",
            keywords: ["scadenza", "timeline", "sprint"],
            content: "Viene discussa la pianificazione del progetto con particolare attenzione alle scadenze imminenti."
          }
        ]
      },
      id: "mock-analysis-" + Date.now(),
      createdAt: new Date()
    });
  }, delay);
};

module.exports = {
  analyzeText,
  analyzeTextMock,
  getAnalysis,
  getAnalysisHistory
}; 