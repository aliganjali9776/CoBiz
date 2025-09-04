require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const jwt = require('jsonwebtoken'); // ✅ این خط اصلاح شد
const { OAuth2Client } = require('google-auth-library');

// مدل‌های دیتابیس
const User = require('./models/User');
const Article = require('./models/Article');
const Review = require('./models/Review');
const KnowledgeCategory = require('./models/KnowledgeCategory');
const KnowledgeFormat = require('./models/KnowledgeFormat');

const app = express();
const port = process.env.PORT || 5001;

// تنظیمات امنیتی CORS برای قبول درخواست از دامنه‌های شما
const allowedOrigins = [
  'http://localhost:3000', // فرانت‌اند در حالت تست
  'http://localhost:5173', // پنل ادمین در حالت تست
  'https://co-biz.ir',     // دامنه اصلی شما
  'https://www.co-biz.ir', // دامنه با www
  'https://cobiz-admin-panel.netlify.app' // دامنه پنل ادمین
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};
app.use(cors(corsOptions));
app.use(express.json());

// --- اتصال به دیتابیس ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('با موفقیت به دیتابیس MongoDB متصل شد'))
  .catch(err => console.error('خطا در اتصال به دیتابیس:', err));

// ==========================================================================
// --- Middleware امنیتی (نگهبان API) ---
// ==========================================================================
const auth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const adminAuth = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'دسترسی فقط برای ادمین مجاز است.' });
  }
  next();
};

// ==========================================================================
// --- API های کاربران (ثبت‌نام، ورود، گوگل و فراموشی رمز) ---
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
    res.status(500).json({ error: 'مشکلی در سرور هنگام ثبت‌نام پیش آمد.' });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'کاربری با این شماره تلفن یافت نشد.' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'رمز عبور اشتباه است.' });
    
    const token = generateToken(user);
    const userResponse = { _id: user._id, name: user.name, phone: user.phone, role: user.role };

    res.json({ user: userResponse, token: `Bearer ${token}` });
  } catch (error) {
    res.status(500).json({ error: 'مشکلی در سرور هنگام ورود پیش آمد.' });
  }
});

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
app.post('/api/users/google-login', async (req, res) => {
    try {
        const { token } = req.body;
        const ticket = await googleClient.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
        const { name, email } = ticket.getPayload();

        let user = await User.findOne({ email });
        if (!user) {
            user = new User({ name, email });
            await user.save();
        }

        const appToken = generateToken(user);
        const userResponse = { _id: user._id, name: user.name, email: user.email, role: user.role };

        res.status(200).json({ user: userResponse, token: `Bearer ${appToken}` });
    } catch (error) {
        res.status(400).json({ error: 'خطا در تایید هویت با گوگل.' });
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
        res.status(500).json({ error: 'خطای سرور' });
    }
});

// ==========================================================================
// --- API های عمومی (اخبار و قیمت) ---
// ==========================================================================
app.get('/api/prices', async (req, res) => {
  try {
    const API_URL = `https://brsapi.ir/Api/Market/Gold_Currency.php?key=${process.env.BRSAPI_KEY}`;
    const response = await axios.get(API_URL);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'مشکلی در سرور هنگام دریافت قیمت‌ها پیش آمد.' });
  }
});

app.get('/api/news', async (req, res) => {
  try {
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
    res.status(500).json({ error: 'مشکلی در دریافت اخبار پیش آمد.' });
  }
});

// ==========================================================================
// --- API های پنل ادمین (نیازمند توکن و نقش ادمین) ---
// ==========================================================================
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت لیست کاربران.' });
  }
});

// (تمام API های دیگر پنل ادمین مثل مدیریت مقالات و ... هم باید اینجا قرار بگیرند)


// --- اجرای سرور ---
app.listen(port, '0.0.0.0', () => { // ✅ اصلاح شده برای Render
  console.log(`سرور بک‌اند با موفقیت در پورت ${port} اجرا شد`);
});

