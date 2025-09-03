// backend/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const axios = require('axios');
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

// --- API قیمت‌های بازار (با BRSAPI.ir) ---
app.get('/api/prices', async (req, res) => {
  try {
    // آدرس صحیح API جدید و کلید API
    const API_URL = `https://brsapi.ir/Api/Market/Gold_Currency.php?key=${process.env.BRSAPI_KEY}`;
    
    // اطمینان از وجود کلید API
    if (!process.env.BRSAPI_KEY) {
      throw new Error('BRSAPI_KEY is not defined in environment variables.');
    }
    
    const response = await axios.get(API_URL);
    
    const data = response.data;
    
    // بررسی پاسخ API
    if (!data) {
      throw new Error('خطا در دریافت اطلاعات از سرویس قیمت.');
    }
    
    // تبدیل داده‌های دریافتی به فرمت مورد نیاز فرانت‌اند
    const prices = {
      gold: data.gold.map(item => ({
        name: item.name,
        price: item.price,
        change: item.change_percent,
        unit: item.unit
      })),
      currency: data.currency.map(item => ({
        name: item.name,
        price: item.price,
        change: item.change_percent,
        unit: item.unit
      })),
    };
    res.json(prices);
  } catch (error) {
    console.error("خطا در API قیمت‌ها:", error.message);
    res.status(500).json({ error: 'مشکلی در سرور هنگام دریافت قیمت‌ها پیش آمد.' });
  }
});

// --- API برای دریافت اخبار از NewsData.io ---
app.get('/api/news', async (req, res) => {
  try {
    const NEWS_API_KEY = process.env.NEWSDATA_API_KEY;
    if (!NEWS_API_KEY) {
      throw new Error('NEWSDATA_API_KEY is not defined in environment variables.');
    }

    const categories = 'business,technology,science';
    const language = 'fa';
    const country = 'ir';

    const response = await axios.get('https://newsdata.io/api/1/news', {
      params: {
        apikey: NEWS_API_KEY,
        category: categories,
        language: language,
        country: country
      }
    });

    res.json(response.data.results);
  } catch (error) {
    console.error("Error fetching news from NewsData.io:", error.message);
    res.status(500).json({ error: 'مشکلی در دریافت اخبار پیش آمد.' });
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

// --- Endpoint هوش مصنوعی (چند-ایجنت) ---
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post('/api/business-chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'پیام کاربر نمی‌تواند خالی باشد.' });
    }

    // تعریف نقش برای هر ایجنت
    const marketingPersona = `شما یک مدیر مارکتینگ متخصص و حرفه‌ای هستید. در تحلیل کسب‌وکار، تنها بر روی استراتژی‌های بازاریابی، کانال‌های تبلیغاتی، برندینگ، و جذب مشتری تمرکز کنید. پاسخ شما باید به زبان فارسی و با لحنی حرفه‌ای باشد.`;
    const salesPersona = `شما یک مدیر فروش با تجربه هستید. در تحلیل کسب‌وکار، فقط به فرآیندهای فروش، افزایش نرخ تبدیل، مدیریت تیم فروش و پیش‌بینی درآمد نگاه کنید. پاسخ شما باید به زبان فارسی و با لحنی حرفه‌ای باشد.`;
    const financialPersona = `شما یک مدیر مالی با دقت بالا هستید. در تحلیل کسب‌وکار، فقط به هزینه‌ها، بودجه‌بندی، سودآوری و بازگشت سرمایه (ROI) توجه کنید. پاسخ شما باید به زبان فارسی و با لحنی حرفه‌ای باشد.`;

    // ارسال درخواست به سه ایجنت به صورت همزمان با استفاده از axios
    const [marketingResult, salesResult, financialResult] = await Promise.all([
      axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        contents: [{ parts: [{ text: `${marketingPersona}\n\nسؤال: ${prompt}` }] }]
      }),
      axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        contents: [{ parts: [{ text: `${salesPersona}\n\nسؤال: ${prompt}` }] }]
      }),
      axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        contents: [{ parts: [{ text: `${financialPersona}\n\nسؤال: ${prompt}` }] }]
      }),
    ]);
    
    // استخراج متن پاسخ از هر ایجنت
    const marketingResponse = marketingResult.data.candidates[0].content.parts[0].text;
    const salesResponse = salesResult.data.candidates[0].content.parts[0].text;
    const financialResponse = financialResult.data.candidates[0].content.parts[0].text;
    
    // ترکیب پاسخ‌ها در یک پاسخ نهایی
    const combinedResponse = `
**تحلیل مدیر مارکتینگ:**
${marketingResponse}

---

**تحلیل مدیر فروش:**
${salesResponse}

---

**تحلیل مدیر مالی:**
${financialResponse}
    `;

    res.json({ response: combinedResponse });

  } catch (error) {
    console.error("Error in /api/business-chat:", error.message);
    // بررسی دقیق‌تر خطای axios
    if (error.response && error.response.data) {
      console.error("Gemini API Error Details:", error.response.data);
    }
    res.status(500).json({ error: 'مشکلی در اجرای هوش مصنوعی پیش آمد.' });
  }
});

// --- اجرای سرور ---
app.listen(port, () => {
  console.log(`سرور بک‌اند با موفقیت در آدرس http://localhost:${port} اجرا شد`);
});
