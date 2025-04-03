const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    timestamp: {
        type: Number,
        required: true
    }
});

const topicSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    points: [{
        type: String
    }],
    timestamp: {
        type: Number,
        required: true
    }
});

const transcriptionSchema = new mongoose.Schema({
    recordingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Recording',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fullText: {
        type: String,
        required: true
    },
    sections: [sectionSchema],
    analysis: {
        summary: String,
        keyPoints: [String],
        decisions: [String],
        topics: [topicSchema]
    },
    language: {
        type: String,
        enum: ['it', 'en'],
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['processing', 'completed', 'error'],
        default: 'processing'
    }
});

// Indici per migliorare le performance delle query
transcriptionSchema.index({ userId: 1, createdAt: -1 });
transcriptionSchema.index({ recordingId: 1 }, { unique: true });

module.exports = mongoose.model('Transcription', transcriptionSchema); 