const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    role: { type: String, required: true, enum: ['Administrator', 'User'] },
    accessLevel: { type: String, required: true, trim: true },
    responsibilities: { type: [String], default: [] },
    guidelines: { type: [String], default: [] },
    canModifyInventory: { type: Boolean, default: false },
    position: { type: String, default: '', trim: true },
    office:   { type: String, default: '', trim: true },
    email:    { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
