// models/User.js (نسخه کامل و نهایی)
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  phone: { 
    type: String, 
    unique: true,
    // sparse: true اجازه می‌دهد چندین کاربر بدون شماره تلفن (مثلاً کاربران گوگل) وجود داشته باشند
    sparse: true 
  },
  email: {
    type: String,
    unique: true,
    sparse: true // این هم برای کاربرانی است که با شماره تلفن ثبت‌نام می‌کنند
  },
  password: { 
    type: String, 
    // required: false چون کاربران گوگل رمز عبور ندارند
  },
  
  // فیلدهای اطلاعات تکمیلی
  companyName: String,
  companySize: String,
  position: String,

  // فیلدهای مربوط به قابلیت‌های اپلیکیشن
  results: mongoose.Schema.Types.Mixed,
  okrsData: mongoose.Schema.Types.Mixed,
  calendarEvents: Array,

  // فیلدهای امنیتی و دسترسی
  role: { 
    type: String,
    default: 'user' // نقش پیش‌فرض برای تمام کاربران جدید
  },
  resetPasswordCode: {
    type: String 
  },
  resetPasswordExpires: {
    type: Date
  },
});

module.exports = mongoose.model('User', userSchema);