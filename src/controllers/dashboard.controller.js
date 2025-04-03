const Analysis = require('../models/analysis.model');
const Recording = require('../models/recording.model');
const { FILE_RETENTION_DAYS } = require('../config/storage.config');

/**
 * Ottiene le statistiche per la dashboard
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Recupera le analisi dell'utente
    const analyses = await Analysis.find({ userId });
    
    // Calcola le statistiche sulle trascrizioni
    const totalTranscriptions = analyses.length;
    
    // Calcola la durata totale degli audio (assumendo 2 minuti per registrazione come esempio)
    // In una implementazione reale questo valore dovrebbe essere calcolato dai dati reali
    const totalAudioMinutes = analyses.length * 2;
    
    // Estrai tutte le keywords per trovare le più frequenti
    const allKeywords = analyses.flatMap(a => a.keywords || []);
    const keywordFrequency = {};
    
    allKeywords.forEach(keyword => {
      keywordFrequency[keyword] = (keywordFrequency[keyword] || 0) + 1;
    });
    
    // Ordina per frequenza e prendi le prime 10
    const mostFrequentKeywords = Object.entries(keywordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));
    
    // Calcola parole medie per trascrizione (valore di esempio)
    const averageWords = analyses.length > 0 
      ? Math.round(analyses.reduce((total, a) => {
          const wordCount = a.rawText ? a.rawText.split(/\s+/).length : 0;
          return total + wordCount;
        }, 0) / analyses.length)
      : 0;
    
    // Stima dello spazio utilizzato (in MB)
    // In una implementazione reale questo sarebbe calcolato dalle dimensioni effettive dei file
    const estimatedSizePerTranscriptionMB = 1.5;
    const totalSizeMB = Math.round(analyses.length * estimatedSizePerTranscriptionMB);
    
    // Limite di storage (esempio)
    const storageLimit = 500; // MB
    const storageUsagePercent = Math.min(100, Math.round((totalSizeMB / storageLimit) * 100));
    
    res.status(200).json({
      totalTranscriptions,
      totalAudioMinutes,
      averageWords,
      mostFrequentKeywords,
      storage: {
        usedMB: totalSizeMB,
        limitMB: storageLimit,
        usagePercent: storageUsagePercent
      }
    });
  } catch (error) {
    console.error('Errore nel recupero delle statistiche:', error);
    res.status(500).json({ 
      error: 'Errore nel recupero delle statistiche',
      details: error.message
    });
  }
};

/**
 * Ottiene la cronologia delle trascrizioni con lo stato di disponibilità dei file audio
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const getTranscriptionHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;
    const skip = parseInt(req.query.skip) || 0;
    
    // Recupera le analisi con popolazione delle trascrizioni e recording
    const analyses = await Analysis.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'transcription',
        populate: {
          path: 'recordingId',
          model: 'Recording'
        }
      });
    
    const total = await Analysis.countDocuments({ userId });
    
    // Arricchisci con informazioni sullo stato del file audio
    const enrichedAnalyses = analyses.map(analysis => {
      // Gestione sicura delle relazioni
      const transcription = analysis.transcription || {}; 
      const recording = transcription.recordingId || {};
      
      const createdAt = new Date(analysis.createdAt);
      const now = new Date();
      
      // Calcola la differenza in giorni
      const diffTime = Math.abs(now - createdAt);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Determina se il file è ancora disponibile
      const isAudioAvailable = diffDays <= FILE_RETENTION_DAYS;
      const daysRemaining = isAudioAvailable ? FILE_RETENTION_DAYS - diffDays : 0;

      return {
        _id: analysis._id,
        transcriptionId: analysis.transcription ? analysis.transcription._id : null,
        recordingId: recording._id || null,
        audioFilename: recording.gcsFilename || null,
        summary: analysis.summary || '',
        keywords: analysis.keywords || [],
        createdAt: analysis.createdAt,
        audio: {
          available: recording._id ? isAudioAvailable : false,
          daysRemaining: daysRemaining,
          expiresOn: isAudioAvailable 
            ? new Date(createdAt.getTime() + (FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000))
            : null
        }
      };
    });
    
    res.status(200).json({
      analyses: enrichedAnalyses,
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

module.exports = {
  getDashboardStats,
  getTranscriptionHistory
}; 