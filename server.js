// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');
const Article = require('./models/Article');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = 5001;

// Middleware
app.use(cors());
app.use(express.json());

// --- اتصال به دیتابیس ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('با موفقیت به دیتابیس MongoDB متصل شد'))
  .catch(err => console.error('خطا در اتصال به دیتابیس:', err));

// --- API های کاربران ---

// API ثبت‌نام جدید
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, phone, password, companyName, companySize, position } = req.body;
    
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ error: 'کاربری با این شماره تلفن از قبل وجود دارد.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      name, phone, password: hashedPassword, companyName, companySize, position,
      results: {}, okrsData: { yearly: [], quarterly: [], monthly: [] }, calendarEvents: []
    });

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({ message: 'ثبت‌نام با موفقیت انجام شد.', user: userResponse });

  } catch (error) {
    console.error("Error in /api/users/register:", error);
    res.status(500).json({ error: 'مشکلی در سرور هنگام ثبت‌نام پیش آمد.' });
  }
});

// API ورود
app.post('/api/users/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ error: 'کاربری با این شماره تلفن یافت نشد.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'رمز عبور اشتباه است.' });
    }
    
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json(userResponse);

  } catch (error) {
    console.error("Error in /api/users/login:", error);
    res.status(500).json({ error: 'مشکلی در سرور هنگام ورود پیش آمد.' });
  }
});

// API آپدیت اطلاعات کاربر
app.post('/api/users/update', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'شماره تلفن مورد نیاز است.' });
    }
    const updatedUser = await User.findOneAndUpdate(
      { phone: phone },
      { $set: req.body },
      { new: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ error: 'کاربر پیدا نشد.' });
    }
    res.json(updatedUser);
  } catch (error) {
    console.error("Error in /api/users/update:", error);
    res.status(500).json({ error: 'مشکلی در سرور هنگام آپدیت کاربر پیش آمد.' });
  }
});


// --- API های کتابخانه دانش ---
app.get('/api/articles', async (req, res) => {
  try {
    const articles = await Article.find();
    res.json(articles);
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت مقالات.' });
  }
});

app.post('/api/articles', async (req, res) => {
  try {
    const newArticle = new Article(req.body);
    await newArticle.save();
    res.status(201).json(newArticle);
  } catch (error) {
    res.status(500).json({ error: 'خطا در ذخیره مقاله.' });
  }
});

app.put('/api/articles/:id', async (req, res) => {
  try {
    const updatedArticle = await Article.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedArticle);
  } catch (error) {
    res.status(500).json({ error: 'خطا در ویرایش مقاله.' });
  }
});

app.delete('/api/articles/:id', async (req, res) => {
  try {
    await Article.findByIdAndDelete(req.params.id);
    res.json({ message: 'مقاله با موفقیت حذف شد.' });
  } catch (error) {
    res.status(500).json({ error: 'خطا در حذف مقاله.' });
  }
});


// --- API برای پنل ادمین ---
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password -results -okrsData -calendarEvents'); // پسورد را هم حذف می‌کنیم
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت لیست کاربران.' });
  }
});

// --- Endpoint هوش مصنوعی ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'پیام کاربر نمی‌تواند خالی باشد.' });
    }
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    res.json({ response: text });
  } catch (error) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ error: 'مشکلی در ارتباط با سرویس هوش مصنوعی پیش آمد.' });
  }
});

// --- اجرای سرور ---
app.listen(port, () => {
  console.log(`سرور بک‌اند با موفقیت در آدرس http://localhost:${port} اجرا شد`);
});