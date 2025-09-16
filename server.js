// backend/server.js (نسخه نهایی، کامل و پایدار با تمام API ها)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');

// مدل‌های دیتابیس
const User = require('./models/User');
const Article = require('./models/Article');
const Review = require('./models/Review');
const KnowledgeCategory = require('./models/KnowledgeCategory');
const KnowledgeFormat = require('./models/KnowledgeFormat');

const app = express();
const port = process.env.PORT || 5001;

// تنظیمات CORS
const allowedOrigins = [
    'http://localhost:3000',
  'http://localhost:5173',
  'https://co-biz.ir',
  'https://www.co-biz.ir',
  'https://cobiz-admin-panel.netlify.app',
  'http://co-biz.ir' 
];
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};
app.use(cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// تنظیمات Multer برای ذخیره فایل
const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, 'uploads/'); },
  filename: (req, file, cb) => { cb(null, `${Date.now()}-${file.originalname}`); }
});
const upload = multer({ storage: storage });

// اتصال به دیتابیس
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('با موفقیت به دیتابیس MongoDB متصل شد'))
  .catch(err => console.error('خطا در اتصال به دیتابیس:', err));

// ==========================================================================
// --- Middleware امنیتی ---
// ==========================================================================
const auth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};
const adminAuth = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'دسترسی فقط برای ادمین مجاز است.' });
  next();
};

// ==========================================================================
// --- API های عمومی کاربران ---
// ==========================================================================
const generateToken = (user) => {
  const payload = { id: user._id, name: user.name, role: user.role };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

app.post('/api/users/register', async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    const existingUser = await User.findOne({ phone });
    if (existingUser) return res.status(400).json({ error: 'کاربری با این شماره تلفن از قبل وجود دارد.' });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = new User({ name, phone, password: hashedPassword });
    await user.save();
    const token = generateToken(user);
    const userResponse = { _id: user._id, name: user.name, phone: user.phone, role: user.role };
    res.status(201).json({ user: userResponse, token: `Bearer ${token}` });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ error: 'مشکلی در سرور هنگام ثبت‌نام پیش آمد.' });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'کاربری با این شماره تلفن یافت نشد.' });
    
    // ✅✅✅ مشکل اصلی اینجا بود: چک کردن وجود پسورد قبل از مقایسه ✅✅✅
    if (!user.password) {
        return res.status(400).json({ error: 'این حساب با گوگل ثبت‌نام شده و رمز عبور ندارد.' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'رمز عبور اشتباه است.' });
    
    const token = generateToken(user);
    const userResponse = { _id: user._id, name: user.name, phone: user.phone, role: user.role };

    res.json({ user: userResponse, token: `Bearer ${token}` });
  } catch (error) {
    console.error("Login Error:", error); // ✅ لاگ کردن دقیق خطا
    res.status(500).json({ error: 'مشکلی در سرور هنگام ورود پیش آمد.' });
  }
});
app.post('/api/users/request-reset-code', async (req, res) => {
  try {
    const { phone } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'کاربر یافت نشد.' });
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordCode = resetCode;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await user.save();
    console.log(`کد بازیابی برای ${phone}: ${resetCode}`);
    res.status(200).json({ message: 'کد تایید ارسال شد.' });
  } catch (error) {
    console.error("Request Reset Code Error:", error);
    res.status(500).json({ error: 'خطای سرور' });
  }
});

app.post('/api/users/reset-password-with-code', async (req, res) => {
    try {
        const { phone, code, newPassword } = req.body;
        const user = await User.findOne({ phone, resetPasswordCode: code, resetPasswordExpires: { $gt: Date.now() } });
        if (!user) return res.status(400).json({ error: 'کد تایید نامعتبر یا منقضی شده است.' });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.resetPasswordCode = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        res.status(200).json({ message: 'رمز عبور با موفقیت تغییر کرد.' });
    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ error: 'خطای سرور' });
    }
});

// ==========================================================================
// --- API های عمومی (اخبار، قیمت) ---
// ==========================================================================
app.get('/api/prices', async (req, res) => {
  try {
    if (!process.env.BRSAPI_KEY) throw new Error('کلید API قیمت تعریف نشده است.');
    const API_URL = `https://brsapi.ir/Api/Market/Gold_Currency.php?key=${process.env.BRSAPI_KEY}`;
    const response = await axios.get(API_URL);
    res.json(response.data);
  } catch (error) {
    console.error("Price API Error:", error.message);
    res.status(500).json({ error: 'مشکلی در سرور هنگام دریافت قیمت‌ها پیش آمد.' });
  }
});

app.get('/api/news', async (req, res) => {
  try {
    if (!process.env.NEWSDATA_API_KEY) throw new Error('کلید API اخبار تعریف نشده است.');
    const response = await axios.get('https://newsdata.io/api/1/news', {
      params: {
        apikey: process.env.NEWSDATA_API_KEY,
        category: 'business,technology',
        language: 'fa',
        country: 'ir'
      }
    });
    res.json(response.data.results);
  } catch (error) {
    console.error("News API Error:", error.message);
    res.status(500).json({ error: 'مشکلی در دریافت اخبار پیش آمد.' });
  }
});

// ==========================================================================
// --- API های پنل ادمین ---
// ==========================================================================
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت لیست کاربران.' });
  }
});

app.get('/api/articles', auth, adminAuth, async (req, res) => {
  const articles = await Article.find();
  res.json(articles);
});
app.post('/api/articles', auth, adminAuth, upload.single('file'), async (req, res) => {
  try {
    const articleData = { ...req.body, tags: req.body.tags ? req.body.tags.split(',') : [] };
    if (req.file) articleData.fileUrl = `/uploads/${req.file.filename}`;
    const newArticle = new Article(articleData);
    await newArticle.save();
    res.status(201).json(newArticle);
  } catch (error) {
    res.status(500).json({ error: 'خطا در ذخیره مقاله.' });
  }
});
app.put('/api/articles/:id', auth, adminAuth, upload.single('file'), async (req, res) => {
    try {
        const articleData = { ...req.body, tags: req.body.tags ? req.body.tags.split(',') : [] };
        if (req.file) articleData.fileUrl = `/uploads/${req.file.filename}`;
        const updatedArticle = await Article.findByIdAndUpdate(req.params.id, articleData, { new: true });
        res.json(updatedArticle);
    } catch (error) {
        res.status(500).json({ error: 'خطا در ویرایش مقاله.' });
    }
});
app.delete('/api/articles/:id', auth, adminAuth, async (req, res) => {
    try {
        await Article.findByIdAndDelete(req.params.id);
        res.json({ message: 'مقاله با موفقیت حذف شد.' });
    } catch (error) {
        res.status(500).json({ error: 'خطا در حذف مقاله.' });
    }
});
app.get('/api/knowledge/categories', auth, adminAuth, async (req, res) => {
  const categories = await KnowledgeCategory.find();
  res.json(categories);
});
app.post('/api/knowledge/categories', auth, adminAuth, async (req, res) => {
  const newCategory = new KnowledgeCategory({ name: req.body.name });
  await newCategory.save();
  res.status(201).json(newCategory);
});
app.delete('/api/knowledge/categories/:id', auth, adminAuth, async (req, res) => {
  await KnowledgeCategory.findByIdAndDelete(req.params.id);
  res.json({ message: 'دسته با موفقیت حذف شد.' });
});
app.get('/api/knowledge/formats', auth, adminAuth, async (req, res) => {
  const formats = await KnowledgeFormat.find();
  res.json(formats);
});
app.post('/api/knowledge/formats', auth, adminAuth, async (req, res) => {
  const newFormat = new KnowledgeFormat({ name: req.body.name });
  await newFormat.save();
  res.status(201).json(newFormat);
});
app.delete('/api/knowledge/formats/:id', auth, adminAuth, async (req, res) => {
  await KnowledgeFormat.findByIdAndDelete(req.params.id);
  res.json({ message: 'نوع با موفقیت حذف شد.' });
});

// --- اجرای سرور ---
app.listen(port, '0.0.0.0', () => {
  console.log(`سرور بک‌اند با موفقیت در پورت ${port} اجرا شد`);
});

