// models/Article.js
const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  format: { type: String, required: true },
  summary: { type: String, required: true },
  tags: [String],
  content: [mongoose.Schema.Types.Mixed],
});

module.exports = mongoose.model('Article', articleSchema);