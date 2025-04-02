const mongoose = require('mongoose');

// Schema per le sezioni dell'analisi
const SectionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  keywords: [{
    type: String
  }]
});

// Schema per le analisi
const AnalysisSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Riferimento formale alla trascrizione (opzionale)
  transcription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transcription',
    required: false
  },
  // ID trascrizione temporaneo (per retrocompatibilità)
  transcriptionId: {
    type: String,
    required: false
  },
  summary: {
    type: String,
    required: true
  },
  tone: {
    type: String
  },
  keywords: [{
    type: String
  }],
  sections: [SectionSchema],
  rawText: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Crea l'indice per velocizzare le ricerche
AnalysisSchema.index({ userId: 1, createdAt: -1 });
AnalysisSchema.index({ transcription: 1 }, { unique: true, sparse: true });
AnalysisSchema.index({ transcriptionId: 1 }, { unique: true, sparse: true });

// Pre-validate hook per verificare che almeno uno dei campi transcription o transcriptionId sia presente
AnalysisSchema.pre('validate', function(next) {
  if (!this.transcription && !this.transcriptionId) {
    this.invalidate('transcription', 'È necessario fornire almeno uno tra transcription e transcriptionId');
  }
  next();
});

const Analysis = mongoose.model('Analysis', AnalysisSchema);

module.exports = Analysis; 