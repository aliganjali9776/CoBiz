// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // این خط اضافه شد
  companyName: String,
  companySize: String,
  position: String,
  results: mongoose.Schema.Types.Mixed,
  okrsData: mongoose.Schema.Types.Mixed,
  calendarEvents: Array,
});

module.exports = mongoose.model('User', userSchema);