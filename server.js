// backend/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const axios = require('axios'); // برای درخواست‌های شبکه‌ای پایدار
const User = require('./models/User');
const Article = require('./models/Article');
const Review = require('./models/Review');
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
      results: {}, 
      okrsData: { yearly: [], quarterly: [], monthly: [] }, 
      calendarEvents: [],
      pomodoroStats: { dailyCycles: {}, totalPoints: 0 },
      subscriptionTier: 'free'
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

app.post('/api/users/update', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) { return res.status(400).json({ error: 'شماره تلفن مورد نیاز است.' }); }
    const updatedUser = await User.findOneAndUpdate({ phone: phone }, { $set: req.body }, { new: true });
    if (!updatedUser) { return res.status(404).json({ error: 'کاربر پیدا نشد.' }); }
    const userResponse = updatedUser.toObject();
    delete userResponse.password;
    res.json(userResponse);
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

// --- API های نقد و بررسی ---
app.get('/api/reviews', async (req, res) => {
  try {
    const reviewsByCategory = await Review.aggregate([
      { $group: { _id: "$category", items: { $push: "$$ROOT" } } }
    ]);
    res.json(reviewsByCategory);
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت نقد و بررسی‌ها.' });
  }
});

// --- API قیمت‌های بازار (با PricetoDay API) ---
app.get('/api/prices', async (req, res) => {
  try {
    const response = await axios.get('https://api.pricetoday.ir/v1/latest');
    const data = response.data;

    if (!data || !data.data) {
      throw new Error('خطا در دریافت اطلاعات از سرویس قیمت.');
    }

    const prices = {
      gold: [
        { name: "گرم طلا ۱۸ عیار", price: data.data.find(i => i.slug === 'gold_18k_gram')?.price || 'N/A', change: '0' },
        { name: "سکه امامی", price: data.data.find(i => i.slug === 'sekeh_emami')?.price || 'N/A', change: '0' },
        { name: "سکه بهار آزادی", price: data.data.find(i => i.slug === 'sekeh_bahar_azadi')?.price || 'N/A', change: '0' },
        { name: "نیم سکه", price: data.data.find(i => i.slug === 'nim_sekeh')?.price || 'N/A', change: '0' },
      ],
      currency: [
        { name: "دلار آمریکا", price: data.data.find(i => i.slug === 'usd')?.price || 'N/A', change: '0' },
        { name: "یورو", price: data.data.find(i => i.slug === 'eur')?.price || 'N/A', change: '0' },
        { name: "درهم امارات", price: data.data.find(i => i.slug === 'aed')?.price || 'N/A', change: '0' },
        { name: "لیر ترکیه", price: data.data.find(i => i.slug === 'try')?.price || 'N/A', change: '0' },
      ]
    };
    res.json(prices);
  } catch (error) {
    console.error("خطا در API قیمت‌ها:", error.message);
    res.status(500).json({ error: 'مشکلی در سرور هنگام دریافت قیمت‌ها پیش آمد.' });
  }
});


// --- API برای پنل ادمین ---
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password -results -okrsData -calendarEvents');
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