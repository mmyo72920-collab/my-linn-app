require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Models
const User = require('./models/User');
const Form = require('./models/Form');

const app = express();

/* =======================
   Preparation
======================= */
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

/* =======================
   Middleware
======================= */
app.use(express.json());
app.use(cors()); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

/* =======================
   MongoDB Connection
======================= */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

/* =======================
   Multer Config (File Uploads)
======================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } 
});

/* =======================
   Auth Routes
======================= */
app.post('/register', async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
        return res.status(400).json({ message: 'အချက်အလက်အားလုံး ဖြည့်စွက်ပါ' });
    }

    if (password.length < 8) {
        return res.status(400).json({ message: 'စကားဝှက်သည် အနည်းဆုံး စာလုံး ၈ လုံး ရှိရပါမည်' });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
        return res.status(400).json({ message: 'ဤဖုန်းနံပါတ်ဖြင့် အကောင့်ရှိပြီးသားပါ' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, phone, password: hashedPassword });

    await user.save();
    res.status(201).json({ message: 'Register successful' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Register error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    
    if (!user) {
        return res.status(401).json({ message: 'ဖုန်းနံပါတ် သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည်' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(401).json({ message: 'စကားဝှက် မှားယွင်းနေပါသည်' });
    }

    res.json({
      message: 'Login successful',
      user: { id: user._id } 
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* =======================
   User Details API (NEW)
======================= */
// User တစ်ဦးချင်းစီ၏ အချက်အလက်ကို ID ဖြင့် ရှာဖွေပေးရန်
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password'); // Password ကို ချန်လှပ်ထားမည်
        if (!user) {
            return res.status(404).json({ message: 'အသုံးပြုသူ ရှာမတွေ့ပါ' });
        }
        res.json(user);
    } catch (err) {
        console.error('Fetch user error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* =======================
   Form Submission
======================= */
app.post('/submit-form', upload.fields([
    { name: 'nrcFile', maxCount: 1 },
    { name: 'householdFile', maxCount: 1 }
  ]), async (req, res) => {
    try {
      const { userId, fullName, age, education, address, fatherName, motherName } = req.body;
      
      if (!req.files || !req.files.nrcFile || !req.files.householdFile) {
          return res.status(400).json({ message: 'ဖိုင်များအားလုံး တင်ပေးရန် လိုအပ်ပါသည်' });
      }

      const form = new Form({
        userId, fullName, age, education, address, fatherName, motherName,
        nrcFile: req.files.nrcFile[0].filename,
        householdFile: req.files.householdFile[0].filename
      });

      await form.save();
      res.json({ message: 'Form submitted successfully' });
    } catch (err) {
      console.error('Submission error:', err);
      res.status(500).json({ message: 'Form submission failed' });
    }
});

/* =======================
   Admin APIs
======================= */
app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    res.json({ message: 'Admin login successful' });
  } else {
    res.status(401).json({ message: 'Invalid admin credentials' });
  }
});

app.get('/admin/forms', async (req, res) => {
  try {
    const forms = await Form.find().sort({ createdAt: -1 });
    res.json(forms);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch forms' });
  }
});

app.get('/admin/form/:id', async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);
    if (!form) return res.status(404).json({ message: 'Data not found' });
    res.json(form);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching form' });
  }
});

app.delete('/admin/form/:id', async (req, res) => {
  try {
    const form = await Form.findByIdAndDelete(req.params.id);
    if (form) {
        const nrcPath = `./uploads/${form.nrcFile}`;
        const hhPath = `./uploads/${form.householdFile}`;
        
        if (fs.existsSync(nrcPath)) fs.unlinkSync(nrcPath);
        if (fs.existsSync(hhPath)) fs.unlinkSync(hhPath);
        
        res.json({ message: 'Data deleted successfully' });
    } else {
        res.status(404).json({ message: 'Form not found' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Delete failed' });
  }
});

/* =======================
   Server Start
======================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
