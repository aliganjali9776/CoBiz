// backend/models/KnowledgeFormat.js

const mongoose = require('mongoose');

const knowledgeFormatSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  }
});

module.exports = mongoose.model('KnowledgeFormat', knowledgeFormatSchema);