require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiter: Max 5 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin Authentication Helper
const isValidAdmin = (req) => {
  const passcode = req.headers['x-admin-passcode'];
  const adminSecret = process.env.ADMIN_PASSCODE;
  
  if (!adminSecret || !passcode) return false;
  return passcode === adminSecret;
};

// API 1: Register User
app.post('/api/auth/register', async (req, res) => {
  const { fullname, phone, password } = req.body;

  if (!fullname || !phone || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare(`INSERT INTO users (fullname, phone, password, role) VALUES (?, ?, ?, 'customer')`);
    const info = stmt.run(fullname, phone, hashedPassword);

    res.status(201).json({
      message: 'Account created successfully!',
      user: { id: info.lastInsertRowid, fullname, phone, role: 'customer' }
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Phone number already registered. Please login.' });
    }
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// API 2: Login with Rate Limiting
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { phone, password } = req.body;
  const adminSecret = process.env.ADMIN_PASSCODE;

  // Admin Login Check
  if (phone === 'admin') {
    if (!adminSecret || password !== adminSecret) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }
    return res.json({
      message: 'Admin access granted',
      user: { id: 0, fullname: 'Administrator', phone: 'admin', role: 'admin' }
    });
  }

  // Customer Login Check
  try {
    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) return res.status(400).json({ error: 'Invalid phone number or password.' });

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

// API 3: Fetch Customer Specific Orders
app.get('/api/user/orders/:userId', (req, res) => {
  const { userId } = req.params;
  try {
    const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Menu
app.get('/api/menu', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM menu').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: SMS Alert
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

// Place Order
app.post('/api/order', (req, res) => {
  const { user_id, customer_phone, delivery_location, fulfillment_type, branch, payment_method, items, total_amount } = req.body;

  if (!customer_phone || !delivery_location || !items || items.length === 0) {
    return res.status(400).json({ error: 'Please fill in all required order details.' });
  }

  const itemsString = JSON.stringify(items);
  const payment_status = payment_method === 'Paystack (Mobile Money)' ? 'Paid (Online)' : 'Pending (Pay on Delivery)';

  const query = `
    INSERT INTO orders (user_id, customer_phone, delivery_location, fulfillment_type, branch, payment_method, payment_status, items, total_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    const stmt = db.prepare(query);
    const info = stmt.run(user_id || null, customer_phone, delivery_location, fulfillment_type, branch, payment_method, payment_status, itemsString, total_amount);

    const newOrderId = info.lastInsertRowid;
    sendAdminSMS({ orderId: newOrderId, customer_phone, delivery_location, fulfillment_type, branch, items, total_amount });

    res.status(201).json({ message: 'Order placed successfully!', orderId: newOrderId });
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
    const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
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
    db.prepare('UPDATE orders SET order_status = ? WHERE id = ?').run(order_status, id);
    res.json({ message: 'Order status updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Add Menu Item
app.post('/api/admin/menu', (req, res) => {
  if (!isValidAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized access.' });
  }

  const { name, category, price, image } = req.body;
  if (!name || !category || !price || !image) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const stmt = db.prepare('INSERT INTO menu (name, category, price, image) VALUES (?, ?, ?, ?)');
    const info = stmt.run(name, category, price, image);
    res.status(201).json({ message: 'Menu item added successfully!', id: info.lastInsertRowid });
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
    let stmt;
    if (target === 'completed') {
      stmt = db.prepare("DELETE FROM orders WHERE order_status = 'Delivered' OR order_status = 'Completed'");
    } else {
      stmt = db.prepare('DELETE FROM orders');
    }
    const info = stmt.run();
    res.json({ message: `Successfully cleared ${info.changes} order record(s).` });
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
    const resetTransaction = db.transaction(() => {
      db.prepare('DELETE FROM orders').run();
      db.prepare("DELETE FROM users WHERE role != 'admin'").run();
    });

    resetTransaction();
    res.json({ message: 'Database reset successfully. All customer orders and accounts cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Kitchen De Stella server running on http://localhost:${PORT}`);
});