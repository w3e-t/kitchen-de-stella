require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
const { initDatabase, getDb, saveDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for image uploads
const uploadsDir = path.join(__dirname, 'public', 'images');

// Create images directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, name + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG images are allowed'));
    }
  }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin Auth Helper
const isValidAdmin = (req) => {
  const passcode = req.headers['x-admin-passcode'];
  const adminSecret = process.env.ADMIN_PASSCODE;
  if (!adminSecret || !passcode) return false;
  return passcode === adminSecret;
};

// Opening Hours Helper (Server-side validation)
function isKitchenOpenServer() {
  const now = new Date();
  const hours = now.getHours(); // 0 to 23
  return hours >= 6 && hours < 22;
}

// API 1: Register User
app.post('/api/auth/register', async (req, res) => {
  const { fullname, phone, password } = req.body;

  if (!fullname || !phone || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const db = getDb();

    // Check existing phone
    const checkStmt = db.prepare('SELECT id FROM users WHERE phone = ?');
    checkStmt.bind([phone]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (exists) {
      return res.status(400).json({ error: 'Phone number already registered. Please login.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    db.run(
      `INSERT INTO users (fullname, phone, password, role) VALUES (?, ?, ?, 'customer')`,
      [fullname, phone, hashedPassword]
    );

    const resStmt = db.prepare('SELECT last_insert_rowid() AS id');
    resStmt.step();
    const newId = resStmt.getAsObject().id;
    resStmt.free();

    saveDatabase();

    res.status(201).json({
      message: 'Account created successfully!',
      user: { id: newId, fullname, phone, role: 'customer' }
    });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ error: err.message || 'Server error during registration.' });
  }
});

// API 2: Login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { phone, password } = req.body;
  const adminSecret = process.env.ADMIN_PASSCODE;

  if (phone === 'admin') {
    if (!adminSecret || password !== adminSecret) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }
    return res.json({
      message: 'Admin access granted',
      user: { id: 0, fullname: 'Administrator', phone: 'admin', role: 'admin' }
    });
  }

  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM users WHERE phone = ?');
    stmt.bind([phone]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(400).json({ error: 'Invalid phone number or password.' });
    }

    const user = stmt.getAsObject();
    stmt.free();

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid phone number or password.' });

    res.json({
      message: 'Login successful!',
      user: { id: user.id, fullname: user.fullname, phone: user.phone, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 3: Fetch Customer Orders
app.get('/api/user/orders/:userId', (req, res) => {
  const { userId } = req.params;
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC');
    stmt.bind([userId]);

    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Menu
app.get('/api/menu', (req, res) => {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM menu');

    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SMS Alert Helper
async function sendAdminSMS(orderData) {
  const adminPhone = process.env.ADMIN_PHONE;
  const apiKey = process.env.SMS_API_KEY;

  if (!apiKey || apiKey === 'your_arkesel_or_hubtel_api_key_here') return;

  const itemsList = orderData.items.map((item) => `${item.name} x${item.quantity}`).join(', ');
  const message = `NEW ORDER (#${orderData.orderId})\nBranch: ${orderData.branch}\nType: ${orderData.fulfillment_type}\nItems: ${itemsList}\nTotal: GHc ${orderData.total_amount}\nPhone: ${orderData.customer_phone}\nLoc: ${orderData.delivery_location}`;

  try {
    await axios.get('https://sms.arkesel.com/sms/api', {
      params: { action: 'send-sms', api_key: apiKey, to: adminPhone, from: process.env.SMS_SENDER_ID || 'Stella', sms: message }
    });
  } catch (error) {
    console.error('Failed to send SMS:', error.message);
  }
}

// Secure Order Submission
app.post('/api/order', (req, res) => {
  // 1. Enforce Operating Hours Server-Side
  if (!isKitchenOpenServer()) {
    return res.status(403).json({ error: 'Kitchen De Stella is currently closed. Orders accepted 6:00 AM – 10:00 PM.' });
  }

  const { user_id, customer_phone, delivery_location, fulfillment_type, branch, payment_method, items } = req.body;

  if (!customer_phone || !delivery_location || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Please fill in all required order details.' });
  }

  try {
    const db = getDb();

    // 2. Fetch current DB menu prices to prevent client-side price tampering
    const stmt = db.prepare('SELECT id, name, price FROM menu');
    const dbMenu = {};
    while (stmt.step()) {
      const row = stmt.getAsObject();
      dbMenu[row.id] = row;
    }
    stmt.free();

    // 3. Recalculate official server-side total
    let calculatedTotal = 0;
    const verifiedItems = [];

    for (const item of items) {
      const dbItem = dbMenu[item.id];
      if (!dbItem) {
        return res.status(400).json({ error: `Invalid menu item selected (ID: ${item.id}).` });
      }
      const quantity = parseInt(item.quantity, 10) || 1;
      calculatedTotal += dbItem.price * quantity;

      verifiedItems.push({
        id: dbItem.id,
        name: dbItem.name,
        price: dbItem.price,
        quantity
      });
    }

    const itemsString = JSON.stringify(verifiedItems);
    const payment_status = payment_method === 'Paystack (Mobile Money)' ? 'Paid (Online)' : 'Pending (Pay on Delivery)';

    db.run(
      `INSERT INTO orders (user_id, customer_phone, delivery_location, fulfillment_type, branch, payment_method, payment_status, items, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id || null, customer_phone, delivery_location, fulfillment_type, branch, payment_method, payment_status, itemsString, calculatedTotal]
    );

    const resStmt = db.prepare('SELECT last_insert_rowid() AS id');
    resStmt.step();
    const newOrderId = resStmt.getAsObject().id;
    resStmt.free();

    saveDatabase();

    sendAdminSMS({ orderId: newOrderId, customer_phone, delivery_location, fulfillment_type, branch, items: verifiedItems, total_amount: calculatedTotal });

    res.status(201).json({ message: 'Order placed successfully!', orderId: newOrderId, total_amount: calculatedTotal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get All Orders
app.get('/api/admin/orders', (req, res) => {
  if (!isValidAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized access.' });
  }

  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM orders ORDER BY created_at DESC');

    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update Status
app.patch('/api/admin/orders/:id', (req, res) => {
  if (!isValidAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized access.' });
  }

  const { order_status } = req.body;
  const { id } = req.params;

  try {
    const db = getDb();
    db.run('UPDATE orders SET order_status = ? WHERE id = ?', [order_status, id]);
    saveDatabase();
    res.json({ message: 'Order status updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Add Menu Item with Image Upload
app.post('/api/admin/menu/add', upload.single('image'), (req, res) => {
  if (!isValidAdmin(req)) {
    if (req.file) {
      fs.unlinkSync(req.file.path); // Delete uploaded file if auth fails
    }
    return res.status(401).json({ error: 'Unauthorized access.' });
  }

  const { name, category, price } = req.body;

  if (!name || !category || !price || !req.file) {
    if (req.file) {
      fs.unlinkSync(req.file.path); // Delete uploaded file if validation fails
    }
    return res.status(400).json({ error: 'All fields are required (name, category, price, image).' });
  }

  const itemPrice = parseFloat(price);
  if (isNaN(itemPrice) || itemPrice < 0) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Please provide a valid price.' });
  }

  try {
    const db = getDb();
    const imageFileName = req.file.filename;
    
    db.run('INSERT INTO menu (name, category, price, image) VALUES (?, ?, ?, ?)', 
      [name, category, itemPrice, imageFileName]);

    const resStmt = db.prepare('SELECT last_insert_rowid() AS id');
    resStmt.step();
    const newId = resStmt.getAsObject().id;
    resStmt.free();

    saveDatabase();
    
    res.status(201).json({ 
      message: `${name} has been added to the menu successfully!`, 
      id: newId,
      image: imageFileName
    });
  } catch (err) {
    if (req.file) {
      fs.unlinkSync(req.file.path); // Delete uploaded file if DB insert fails
    }
    res.status(500).json({ error: err.message || 'Failed to add menu item.' });
  }
});

// Admin: Add Menu Item (Legacy - without file upload)
app.post('/api/admin/menu', (req, res) => {
  if (!isValidAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized access.' });
  }

  const { name, category, price, image } = req.body;
  if (!name || !category || !price || !image) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const db = getDb();
    db.run('INSERT INTO menu (name, category, price, image) VALUES (?, ?, ?, ?)', [name, category, price, image]);

    const resStmt = db.prepare('SELECT last_insert_rowid() AS id');
    resStmt.step();
    const newId = resStmt.getAsObject().id;
    resStmt.free();

    saveDatabase();
    res.status(201).json({ message: 'Menu item added successfully!', id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update Item Price
app.put('/api/admin/menu/:id/price', (req, res) => {
  if (!isValidAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized access.' });
  }

  const { id } = req.params;
  const { price } = req.body;

  if (price === undefined || isNaN(price) || price < 0) {
    return res.status(400).json({ error: 'Please provide a valid price.' });
  }

  try {
    const db = getDb();
    db.run('UPDATE menu SET price = ? WHERE id = ?', [parseFloat(price), id]);
    saveDatabase();
    res.json({ message: 'Item price updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete Orders
app.delete('/api/admin/orders', (req, res) => {
  if (!isValidAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized access.' });
  }

  const { target } = req.query;

  try {
    const db = getDb();
    if (target === 'completed') {
      db.run("DELETE FROM orders WHERE order_status = 'Delivered' OR order_status = 'Completed'");
    } else {
      db.run('DELETE FROM orders');
    }
    saveDatabase();
    res.json({ message: 'Successfully cleared order record(s).' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Full Reset
app.post('/api/admin/reset-db', (req, res) => {
  if (!isValidAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized access.' });
  }

  try {
    const db = getDb();
    db.run('DELETE FROM orders');
    db.run("DELETE FROM users WHERE role != 'admin'");
    saveDatabase();
    res.json({ message: 'Database reset successfully. All customer orders and accounts cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize DB before starting Express server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Kitchen De Stella server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database server:', err);
});