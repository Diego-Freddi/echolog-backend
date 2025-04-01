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
  transcriptionId: {
    type: String,
    required: true
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
AnalysisSchema.index({ userId: 1, transcriptionId: 1 });
AnalysisSchema.index({ createdAt: -1 });

const Analysis = mongoose.model('Analysis', AnalysisSchema);

module.exports = Analysis; 