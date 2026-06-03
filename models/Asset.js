const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema(
  {
    assetId: { type: String, required: true, unique: true, trim: true },
    itemName: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    imageFilename: { type: String, default: '' },
    serialTagNumber: { type: String, required: true, trim: true },
    status: { type: String, required: true, trim: true },
    assignedTo: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true },
    maintenanceDate: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Asset', assetSchema);
