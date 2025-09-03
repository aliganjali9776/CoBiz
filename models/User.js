// models/User.js (نسخه اصلاح شده)
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  companyName: String,
  companySize: String,
  position: String,
  results: mongoose.Schema.Types.Mixed,
  okrsData: mongoose.Schema.Types.Mixed,
  calendarEvents: Array,

  // ✅ فیلدهای جدید از اینجا اضافه شدند
  role: { 
    type: String,
    default: 'user' // مقدار پیش‌فرض برای کاربران عادی
  },
  resetPasswordCode: {
    type: String 
  },
  resetPasswordExpires: {
    type: Date
  },
});

module.exports = mongoose.model('User', userSchema);