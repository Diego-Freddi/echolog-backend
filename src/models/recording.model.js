const mongoose = require('mongoose');

const recordingSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    audioUrl: {
        type: String,
        required: true
    },
    duration: {
        type: Number,  // in seconds
        required: true
    },
    format: {
        type: String,
        enum: ['WAV', 'MP3'],
        required: true
    },
    size: {
        type: Number,  // in bytes
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

module.exports = mongoose.model('Recording', recordingSchema); 