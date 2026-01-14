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
   Preparation (Folder check)
======================= */
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

/* =======================
   Middleware
======================= */
app.use(express.json());

// CORS config - Render ပေါ်တွင် အခြားနေရာမှ လှမ်းခေါ်မှုကို ခွင့်ပြုရန်
app.use(cors()); 

// Static Folders
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

/* =======================
   MongoDB Connection
======================= */
// process.env.MONGO_URI ကို Render Dashboard တွင် သေချာထည့်ပေးထားရမည်
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
    // File နာမည်ကို Unique ဖြစ်အောင် လုပ်ခြင်း
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB Max
});

/* =======================
   Unified Login (User & Admin)
======================= */
app.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    // ၁။ Admin စစ်ဆေးခြင်း (.env ထဲမှ ADMIN_USERNAME နှင့် ADMIN_PASSWORD ကို သုံးသည်)
    if (phone === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        return res.json({ 
            message: 'Admin login successful', 
            isAdmin: true 
        });
    }

    // ၂။ ပုံမှန် User စစ်ဆေးခြင်း
    const user = await User.findOne({ phone });
    if (!user) return res.status(401).json({ message: 'ဖုန်းနံပါတ် သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည်' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'စကားဝှက် မှားယွင်းနေပါသည်' });

    res.json({ 
        message: 'Login successful', 
        isAdmin: false,
        user: { id: user._id } 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* =======================
   User & Form Management API
======================= */

// User အချက်အလက်ယူရန်
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ message: 'အသုံးပြုသူ ရှာမတွေ့ပါ' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Form တင်ပြီးသားရှိမရှိ စစ်ဆေးရန်
app.get('/api/check-form/:userId', async (req, res) => {
    try {
        const form = await Form.findOne({ userId: req.params.userId });
        if (form) {
            // dynamic host သတ်မှတ်ခြင်း (Local သို့မဟုတ် Render URL အလိုအလျောက်သိစေရန်)
            const protocol = req.protocol;
            const host = req.get('host');
            const baseUrl = `${protocol}://${host}/uploads/`;

            res.json({ 
                exists: true, 
                data: {
                    ...form._doc,
                    nrcUrl: baseUrl + form.nrcFile,
                    householdUrl: baseUrl + form.householdFile
                } 
            });
        } else {
            res.json({ exists: false });
        }
    } catch (err) {
        res.status(500).json({ message: 'Error checking form' });
    }
});

/* =======================
   Form Submission & Update
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
      console.error(err);
      res.status(500).json({ message: 'Form submission failed' });
    }
});

app.put('/api/update-form/:userId', upload.fields([
    { name: 'nrcFile', maxCount: 1 },
    { name: 'householdFile', maxCount: 1 }
]), async (req, res) => {
    try {
        const { fullName, age, education, address, fatherName, motherName } = req.body;
        let updateData = { fullName, age, education, address, fatherName, motherName };

        if (req.files && req.files.nrcFile) updateData.nrcFile = req.files.nrcFile[0].filename;
        if (req.files && req.files.householdFile) updateData.householdFile = req.files.householdFile[0].filename;

        const updatedForm = await Form.findOneAndUpdate(
            { userId: req.params.userId },
            { $set: updateData },
            { new: true }
        );

        res.json({ message: 'Update အောင်မြင်ပါသည်', data: updatedForm });
    } catch (err) {
        res.status(500).json({ message: 'Update လုပ်ဆောင်မှု မအောင်မြင်ပါ' });
    }
});

/* =======================
   Admin APIs
======================= */

app.get('/admin/forms', async (req, res) => {
  try {
    const forms = await Form.find().sort({ createdAt: -1 });
    res.json(forms);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch forms' });
  }
});

app.delete('/admin/form/:id', async (req, res) => {
  try {
    const form = await Form.findByIdAndDelete(req.params.id);
    if (form) {
        // File များကိုပါ folder ထဲမှ ဖျက်ထုတ်ခြင်း
        const nrcPath = path.join(__dirname, 'uploads', form.nrcFile);
        const hhPath = path.join(__dirname, 'uploads', form.householdFile);
        
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
const PORT = process.env.PORT || 10000; // Render အတွက် default port 10000 သုံးခြင်းက ပိုကောင်းပါသည်
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
