// backend/models/KnowledgeCategory.js

const mongoose = require('mongoose');

const knowledgeCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  }
});

module.exports = mongoose.model('KnowledgeCategory', knowledgeCategorySchema);