// backend/models/Review.js
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  logoUrl: String,
  category: { type: String, required: true }, // e.g., 'CRM', 'Accounting'
  summary: String,
  overallScore: Number,
  pros: [String],
  cons: [String],
  videoUrl: String,
  features: [{ feature: String, value: String }],
  fullReview: String,
});

module.exports = mongoose.model('Review', reviewSchema);