const mongoose = require('mongoose');

const formSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fullName: { type: String, required: true },
  age: { type: Number, required: true },
  education: { type: String, required: true },
  address: { type: String, required: true },
  fatherName: { type: String, required: true },
  motherName: { type: String, required: true },
  nrcFile: { type: String, required: true },       // Stores the filename
  householdFile: { type: String, required: true } // Stores the filename
}, { timestamps: true });

module.exports = mongoose.model('Form', formSchema);