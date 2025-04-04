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
        required: function() {
            return this.format !== 'TEXT'; // L'URL audio è richiesto solo se non è un formato testuale
        }
    },
    filename: {
        type: String,
        unique: true,
        sparse: true
    },
    gcsFilename: {
        type: String,
        required: false
    },
    duration: {
        type: Number,  // in seconds
        required: true
    },
    format: {
        type: String,
        enum: ['WAV', 'MP3', 'TEXT'], // Aggiunto TEXT per recording virtuali
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