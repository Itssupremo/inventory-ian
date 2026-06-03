const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const Asset = require('./models/Asset');
const User = require('./models/User');
const Settings = require('./models/Settings');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET || 'inventory-system-dev-secret';

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

const CATEGORIES = [
  'Laptop',
  'Desktop PC',
  'Tablet',
  'Printer',
  'Network Equipment',
  'Electronics/Appliances',
  'Office Furniture',
  'Air Conditioner',
  'Monitor',
];
const STATUSES = ['Available', 'Assigned', 'In Repair', 'Retired'];
const ID_PREFIX_MAP = {
  'Laptop':                 'HW',
  'Desktop PC':             'HW',
  'Tablet':                 'HW',
  'Printer':                'HW',
  'Network Equipment':      'NW',
  'Electronics/Appliances': 'EA',
  'Office Furniture':       'CH',
  'Air Conditioner':        'AC',
  'Monitor':                'HW',
};

// Days between scheduled maintenance per category (matches frequency table)
const MAINTENANCE_FREQUENCY = {
  'Laptop':                 30,
  'Desktop PC':             30,
  'Tablet':                 30,
  'Printer':                30,
  'Network Equipment':      90,
  'Electronics/Appliances': 90,
  'Office Furniture':       180,
  'Air Conditioner':        90,
  'Monitor':                90,
};
const MAINTENANCE_ACTIVITY = {
  'Laptop':                 'Cleaning, updates, inspection',
  'Desktop PC':             'Cleaning, updates, inspection',
  'Tablet':                 'Cleaning, updates, battery check',
  'Printer':                'Cleaning and testing',
  'Network Equipment':      'Inspection and firmware updates',
  'Electronics/Appliances': 'Inspection and functional testing',
  'Office Furniture':       'Inspection and tightening of parts',
  'Air Conditioner':        'Cleaning and preventive maintenance',
  'Monitor':                'Cleaning and inspection',
};

const ROLE_PROFILES = {
  Administrator: {
    role: 'Administrator',
    accessLevel: 'Full System Access',
    responsibilities: [
      'Managing inventory items (add, edit, update, delete).',
      'Monitoring stock levels and generating alerts for low-stock items.',
      'Viewing inventory analytics and reports.',
      'Managing users and their permissions.',
      'Tracking item movements, transactions, and audit logs.',
      'Assisting with purchase requests and stock replenishment.',
      'Providing accurate summaries of inventory status.',
    ],
    guidelines: [
      'Respond professionally and concisely.',
      'Prioritize data accuracy and inventory integrity.',
      'Suggest actions when stock levels are critical.',
      'Never perform actions without administrator confirmation when data will be modified.',
      'Present reports in a clear tabular format when appropriate.',
    ],
    canModifyInventory: true,
  },
  User: {
    role: 'User',
    accessLevel: 'Limited Access',
    responsibilities: [
      'Searching and viewing available inventory items.',
      'Checking stock availability.',
      'Submitting inventory requests.',
      'Viewing the status of submitted requests.',
      'Receiving notifications regarding inventory updates.',
      'Assisting users in locating inventory information.',
    ],
    guidelines: [
      'Respond clearly and politely.',
      'Only provide information the user is authorized to access.',
      'Do not allow modification of inventory records.',
      'Refer administrative tasks to authorized personnel.',
      'Explain inventory request procedures when asked.',
    ],
    canModifyInventory: false,
  },
};

const DEFAULT_USERS = [
  {
    username: 'admin',
    password: 'admin123',
    displayName: 'System Administrator',
    ...ROLE_PROFILES.Administrator,
  },
  {
    username: 'ian',
    password: 'ian123',
    displayName: 'Standard User',
    ...ROLE_PROFILES.User,
  },
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only image files are allowed.'));
  },
});

function normalizeMongoUri(rawValue) {
  let mongoUri = String(rawValue || '').trim();

  if ((mongoUri.startsWith('"') && mongoUri.endsWith('"')) || (mongoUri.startsWith("'") && mongoUri.endsWith("'"))) {
    mongoUri = mongoUri.slice(1, -1).trim();
  }

  if (/^MONGO_URI\s*=\s*/i.test(mongoUri)) {
    mongoUri = mongoUri.replace(/^MONGO_URI\s*=\s*/i, '').trim();
  }

  return mongoUri;
}

function validateMongoUri(mongoUri) {
  if (!mongoUri) {
    throw new Error('MONGO_URI is missing. Add it in your .env file.');
  }

  if (mongoUri.includes('<db_password>')) {
    throw new Error(
      'MONGO_URI still contains <db_password>. Replace it with your actual Atlas DB user password in .env.'
    );
  }

  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    throw new Error('Invalid MONGO_URI format. It must start with "mongodb://" or "mongodb+srv://".');
  }
}

app.use(express.json());
const isProduction = process.env.NODE_ENV === 'production';
const normalizedUriForSession = normalizeMongoUri(MONGO_URI);
let sessionStore;
if (normalizedUriForSession) {
  try {
    validateMongoUri(normalizedUriForSession);
    sessionStore = MongoStore.create({
      mongoUrl: normalizedUriForSession,
      ttl: 60 * 60 * 8,
      autoRemove: 'native',
    });
  } catch (err) {
    console.error('Session store setup error:', err.message || err);
  }
}

app.set('trust proxy', 1);
app.use(session({
  name: 'inventory.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  ...(sessionStore ? { store: sessionStore } : {}),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8,
  },
}));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(PUBLIC_DIR));

let initError = null;
const initPromise = ensureStorage()
  .then(connectDB)
  .then(seedDefaultUsers)
  .catch((err) => {
    initError = err;
    console.error('Initialization error:', err);
    return null;
  });

app.use(async (_req, _res, next) => {
  if (initError) {
    next(initError);
    return;
  }

  try {
    await initPromise;
    next();
  } catch (err) {
    next(err);
  }
});

async function ensureStorage() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

async function connectDB() {
  const mongoUri = normalizeMongoUri(MONGO_URI);
  validateMongoUri(mongoUri);

  try {
    await mongoose.connect(mongoUri, {
      dbName: 'inventory_system',
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 5,
    });
  } catch (err) {
    if (err?.code === 8000) {
      throw new Error(
        'MongoDB authentication failed. Verify username/password and URL-encode special characters in the password.'
      );
    }
    throw err;
  }
}

async function seedDefaultUsers() {
  for (const user of DEFAULT_USERS) {
    const exists = await User.findOne({ username: user.username }).select('_id').lean();
    if (exists) continue;

    const passwordHash = await bcrypt.hash(user.password, 10);
    await User.create({
      username: user.username,
      passwordHash,
      displayName: user.displayName,
      role: user.role,
      accessLevel: user.accessLevel,
      responsibilities: user.responsibilities,
      guidelines: user.guidelines,
      canModifyInventory: user.canModifyInventory,
      isActive: true,
    });
  }

  // Do NOT delete non-default users — they may have been created via the admin panel.
}

function toSafeUser(user) {
  return {
    internalId: String(user._id),
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    accessLevel: user.accessLevel,
    responsibilities: user.responsibilities,
    guidelines: user.guidelines,
    canModifyInventory: user.canModifyInventory,
    position: user.position || '',
    office: user.office   || '',
    email: user.email     || '',
    isActive: user.isActive,
  };
}

async function loadSessionUser(req, _res, next) {
  const id = req.session?.userId;
  if (!id) {
    req.currentUser = null;
    next();
    return;
  }

  const user = await User.findById(id);
  if (!user || !user.isActive) {
    req.session.userId = null;
    req.currentUser = null;
    next();
    return;
  }

  req.currentUser = user;
  next();
}

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.currentUser) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    if (!roles.includes(req.currentUser.role)) {
      res.status(403).json({ message: 'You are not authorized for this action.' });
      return;
    }

    next();
  };
}

function normalizeText(value) {
  return String(value || '').trim();
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '');
}

function isAssetAssignedToUser(asset, user) {
  if (!asset || !user) return false;
  if (user.role === 'Administrator') return true;

  const assignedRaw = String(asset.assignedTo || '').trim();
  if (!assignedRaw) return false;

  const assignedCandidates = new Set(
    assignedRaw
      .split(/[;,]/)
      .map(normalizeIdentity)
      .filter(Boolean)
  );

  for (const m of assignedRaw.matchAll(/@([A-Za-z0-9._-]+)/g)) {
    const token = normalizeIdentity(m[1]);
    if (token) assignedCandidates.add(token);
  }

  const username = normalizeIdentity(user.username);
  const displayName = normalizeIdentity(user.displayName);

  return (username && assignedCandidates.has(username)) ||
         (displayName && assignedCandidates.has(displayName));
}

function getCategoryPrefix(category) {
  return ID_PREFIX_MAP[category] || 'AS';
}

async function generateAssetId(category) {
  const prefix = getCategoryPrefix(category);
  const regex = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;

  const assets = await Asset.find({ assetId: { $regex: `^${prefix}-` } }).select('assetId').lean();

  for (const asset of assets) {
    const match = String(asset.assetId || '').match(regex);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }

  const next = max + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

function validatePayload(payload) {
  const errors = [];
  if (!payload.itemName) errors.push('Item Name is required.');
  if (!payload.category || !CATEGORIES.includes(payload.category)) {
    errors.push('Category must be one of: ' + CATEGORIES.join(', ') + '.');
  }
  if (!payload.serialTagNumber) errors.push('Serial / Tag Number is required.');
  if (!payload.status || !STATUSES.includes(payload.status)) {
    errors.push('Status must be one of: Available, Assigned, In Repair, Retired.');
  }
  return errors;
}

function toAssetResponse(asset) {
  const row = asset.toObject ? asset.toObject() : asset;
  const maintDateStr = row.maintenanceDate ? row.maintenanceDate.toISOString().slice(0, 10) : '';
  const freqDays = MAINTENANCE_FREQUENCY[row.category] || 90;
  let nextMaintenanceDate = '';
  if (row.maintenanceDate) {
    const next = new Date(row.maintenanceDate);
    next.setDate(next.getDate() + freqDays);
    nextMaintenanceDate = next.toISOString().slice(0, 10);
  }
  return {
    ...row,
    internalId: String(row._id),
    imageUrl: row.imageFilename ? `/uploads/${row.imageFilename}` : '',
    maintenanceDate: maintDateStr,
    nextMaintenanceDate,
    maintenanceFrequencyDays: freqDays,
    maintenanceActivity: MAINTENANCE_ACTIVITY[row.category] || 'Inspection and cleaning',
  };
}

async function deleteImageIfExists(filename) {
  if (!filename) return;
  const filePath = path.join(UPLOADS_DIR, filename);
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore missing files.
  }
}

app.use(loadSessionUser);

app.get('/api/meta/options', requireAuth, (_req, res) => {
  res.json({ categories: CATEGORIES, statuses: STATUSES });
});

app.post('/api/auth/login', async (req, res) => {
  const username = normalizeText(req.body?.username).toLowerCase();
  const password = normalizeText(req.body?.password);

  if (!username || !password) {
    res.status(400).json({ message: 'Username and password are required.' });
    return;
  }

  const user = await User.findOne({ username });
  if (!user || !user.isActive) {
    res.status(401).json({ message: 'Invalid username or password.' });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ message: 'Invalid username or password.' });
    return;
  }

  req.session.userId = String(user._id);
  res.json({ user: toSafeUser(user) });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('inventory.sid');
    res.json({ message: 'Logged out.' });
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: toSafeUser(req.currentUser) });
});

app.get('/api/meta/roles', requireAuth, (_req, res) => {
  res.json({
    roles: [ROLE_PROFILES.Administrator, ROLE_PROFILES.User],
  });
});

app.get('/api/users', requireRole(['Administrator']), async (_req, res) => {
  const users = await User.find().sort({ role: 1, username: 1 });
  res.json(users.map(toSafeUser));
});

app.post('/api/users', requireRole(['Administrator']), async (req, res) => {
  const { username, password, displayName, role, position, office, email } = req.body;
  if (!username || !password || !displayName || !role) {
    res.status(400).json({ message: 'Username, password, display name and role are required.' });
    return;
  }
  const allowed = ['Administrator', 'User'];
  if (!allowed.includes(role)) {
    res.status(400).json({ message: 'Invalid role.' });
    return;
  }
  const exists = await User.findOne({ username: username.trim().toLowerCase() });
  if (exists) {
    res.status(409).json({ message: 'Username already exists.' });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const profile = ROLE_PROFILES[role];
  const newUser = await User.create({
    username: username.trim().toLowerCase(),
    passwordHash,
    displayName: displayName.trim(),
    role,
    accessLevel:        profile.accessLevel,
    responsibilities:   profile.responsibilities,
    guidelines:         profile.guidelines,
    canModifyInventory: profile.canModifyInventory,
    position: (position || '').trim(),
    office:   (office   || '').trim(),
    email:    (email    || '').trim(),
    isActive: true,
  });
  res.status(201).json(toSafeUser(newUser));
});

app.put('/api/users/:id', requireRole(['Administrator']), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }

  if (String(user._id) === String(req.currentUser._id) && req.body.isActive === false) {
    res.status(400).json({ message: 'Cannot deactivate your own account.' });
    return;
  }

  if (req.body.displayName !== undefined) {
    const name = normalizeText(req.body.displayName);
    if (name) user.displayName = name;
  }
  if (req.body.position !== undefined) user.position = normalizeText(req.body.position);
  if (req.body.office   !== undefined) user.office   = normalizeText(req.body.office);
  if (req.body.email    !== undefined) user.email    = (req.body.email || '').trim();
  if (req.body.isActive !== undefined) user.isActive = Boolean(req.body.isActive);

  await user.save();
  res.json(toSafeUser(user));
});

app.delete('/api/users/:id', requireRole(['Administrator']), async (req, res) => {
  if (String(req.params.id) === String(req.currentUser._id)) {
    res.status(400).json({ message: 'Cannot delete your own account.' });
    return;
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  res.json({ message: 'User deleted.' });
});

app.put('/api/auth/profile', requireAuth, async (req, res) => {
  const user = req.currentUser;

  if (req.body.displayName !== undefined) {
    const name = normalizeText(req.body.displayName);
    if (name) user.displayName = name;
  }
  if (req.body.position !== undefined) user.position = normalizeText(req.body.position);
  if (req.body.office   !== undefined) user.office   = normalizeText(req.body.office);
  if (req.body.email    !== undefined) user.email    = (req.body.email || '').trim();

  await user.save();
  res.json({ user: toSafeUser(user) });
});

// ── Settings / Module visibility ──
const MODULE_KEYS = ['image', 'assetId', 'itemName', 'category', 'serialTag', 'status', 'assignedTo', 'location', 'maintenanceDate'];

async function getOrCreateSettings() {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  return s;
}

app.get('/api/settings', requireAuth, async (_req, res) => {
  const s = await getOrCreateSettings();
  res.json({ modules: s.modules });
});

app.put('/api/settings/modules', requireRole(['Administrator']), async (req, res) => {
  const s = await getOrCreateSettings();
  for (const key of MODULE_KEYS) {
    if (req.body[key] !== undefined) {
      s.modules[key] = Boolean(req.body[key]);
    }
  }
  s.markModified('modules');
  await s.save();
  res.json({ modules: s.modules });
});

app.get('/api/assets', requireAuth, async (req, res) => {
  const assets = await Asset.find().sort({ createdAt: -1 });
  const visible = req.currentUser?.role === 'Administrator'
    ? assets
    : assets.filter(asset => isAssetAssignedToUser(asset, req.currentUser));
  res.json(visible.map(toAssetResponse));
});

app.get('/api/assets/:internalId', requireAuth, async (req, res) => {
  const asset = await Asset.findById(req.params.internalId);
  if (!asset) {
    res.status(404).json({ message: 'Asset not found.' });
    return;
  }
  if (!isAssetAssignedToUser(asset, req.currentUser)) {
    res.status(404).json({ message: 'Asset not found.' });
    return;
  }
  res.json(toAssetResponse(asset));
});

app.post('/api/assets', requireRole(['Administrator', 'User']), upload.single('image'), async (req, res) => {
  const isAdmin = req.currentUser?.role === 'Administrator';
  const useAutoId = isAdmin ? parseBoolean(req.body.useAutoId) : true;
  const category = normalizeText(req.body.category);
  const payload = {
    itemName: normalizeText(req.body.itemName),
    category,
    serialTagNumber: normalizeText(req.body.serialTagNumber),
    status: normalizeText(req.body.status),
    assignedTo: isAdmin ? normalizeText(req.body.assignedTo) : normalizeText(req.currentUser?.username),
    location: normalizeText(req.body.location),
    maintenanceDate: isAdmin && req.body.maintenanceDate ? new Date(req.body.maintenanceDate) : null,
  };

  const errors = validatePayload(payload);
  if (errors.length > 0) {
    if (req.file?.filename) await deleteImageIfExists(req.file.filename);
    res.status(400).json({ message: 'Validation failed.', errors });
    return;
  }

  let assetId = isAdmin ? normalizeText(req.body.assetId) : '';
  if (useAutoId || !assetId) {
    assetId = await generateAssetId(category);
  }

  const duplicate = await Asset.findOne({
    assetId: { $regex: `^${escapeRegExp(assetId)}$`, $options: 'i' },
  });
  if (duplicate) {
    if (req.file?.filename) await deleteImageIfExists(req.file.filename);
    res.status(400).json({ message: 'Asset ID already exists.' });
    return;
  }

  const asset = await Asset.create({
    assetId,
    ...payload,
    imageFilename: req.file?.filename || '',
  });

  res.status(201).json(toAssetResponse(asset));
});

app.put('/api/assets/:internalId', requireRole(['Administrator', 'User']), upload.single('image'), async (req, res) => {
  const current = await Asset.findById(req.params.internalId);
  const isAdmin = req.currentUser?.role === 'Administrator';

  if (!current) {
    if (req.file?.filename) await deleteImageIfExists(req.file.filename);
    res.status(404).json({ message: 'Asset not found.' });
    return;
  }

  if (!isAssetAssignedToUser(current, req.currentUser)) {
    if (req.file?.filename) await deleteImageIfExists(req.file.filename);
    res.status(403).json({ message: 'You are not authorized for this action.' });
    return;
  }

  const useAutoId = isAdmin ? parseBoolean(req.body.useAutoId) : false;
  const category = normalizeText(req.body.category) || current.category;

  const payload = {
    itemName: normalizeText(req.body.itemName),
    category,
    serialTagNumber: normalizeText(req.body.serialTagNumber),
    status: normalizeText(req.body.status),
    assignedTo: isAdmin ? normalizeText(req.body.assignedTo) : current.assignedTo,
    location: normalizeText(req.body.location),
    maintenanceDate: isAdmin
      ? (req.body.maintenanceDate ? new Date(req.body.maintenanceDate) : null)
      : current.maintenanceDate,
  };

  const errors = validatePayload(payload);
  if (errors.length > 0) {
    if (req.file?.filename) await deleteImageIfExists(req.file.filename);
    res.status(400).json({ message: 'Validation failed.', errors });
    return;
  }

  let assetId = isAdmin ? normalizeText(req.body.assetId) : current.assetId;
  if (isAdmin && useAutoId && assetId === '') {
    assetId = await generateAssetId(category);
  }
  if (!assetId) assetId = current.assetId;

  const duplicate = await Asset.findOne({
    _id: { $ne: current._id },
    assetId: { $regex: `^${escapeRegExp(assetId)}$`, $options: 'i' },
  });
  if (duplicate) {
    if (req.file?.filename) await deleteImageIfExists(req.file.filename);
    res.status(400).json({ message: 'Asset ID already exists.' });
    return;
  }

  current.assetId = assetId;
  current.itemName = payload.itemName;
  current.category = payload.category;
  current.serialTagNumber = payload.serialTagNumber;
  current.status = payload.status;
  current.assignedTo = payload.assignedTo;
  current.location = payload.location;
  current.maintenanceDate = payload.maintenanceDate;

  if (req.file?.filename) {
    await deleteImageIfExists(current.imageFilename);
    current.imageFilename = req.file.filename;
  }

  await current.save();

  res.json(toAssetResponse(current));
});

app.delete('/api/assets/:internalId', requireRole(['Administrator']), async (req, res) => {
  const removed = await Asset.findByIdAndDelete(req.params.internalId);
  if (!removed) {
    res.status(404).json({ message: 'Asset not found.' });
    return;
  }

  await deleteImageIfExists(removed.imageFilename);

  res.json({ message: 'Asset deleted successfully.' });
});

app.use((err, _req, res, _next) => {
  const isMulter = err instanceof multer.MulterError;
  const status = isMulter ? 400 : (err?.status || err?.statusCode || 500);
  if (status >= 500) {
    console.error('Server error:', err);
  }
  res.status(status).json({ message: err?.message || 'Server error.' });
});

if (require.main === module) {
  initPromise
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Inventory system running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to initialize application.', err);
      process.exit(1);
    });
}

module.exports = app;
