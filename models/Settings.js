const mongoose = require('mongoose');

// Singleton document — app always uses Settings.findOne() / upsert.
const settingsSchema = new mongoose.Schema({
  modules: {
    image:           { type: Boolean, default: true },
    assetId:         { type: Boolean, default: true },
    itemName:        { type: Boolean, default: true },
    category:        { type: Boolean, default: true },
    serialTag:       { type: Boolean, default: true },
    status:          { type: Boolean, default: true },
    assignedTo:      { type: Boolean, default: true },
    location:        { type: Boolean, default: true },
    maintenanceDate: { type: Boolean, default: true },
  },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
