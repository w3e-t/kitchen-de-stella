const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'stella.db');

let db;

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();
  
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }

  // 1. Create Tables
  db.run(`
    CREATE TABLE IF NOT EXISTS menu (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      image TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullname TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'customer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT NULL,
      customer_phone TEXT NOT NULL,
      delivery_location TEXT NOT NULL,
      fulfillment_type TEXT NOT NULL,
      branch TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      items TEXT NOT NULL,
      total_amount REAL NOT NULL,
      payment_status TEXT DEFAULT 'Pending',
      order_status TEXT DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // 2. Migrations
  try { db.run("ALTER TABLE orders ADD COLUMN user_id INTEGER DEFAULT NULL"); } catch (e) {}
  try { db.run("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'Pending'"); } catch (e) {}
  try { db.run("ALTER TABLE orders ADD COLUMN order_status TEXT DEFAULT 'Pending'"); } catch (e) {}

  // 3. Seed Menu
  const res = db.exec('SELECT COUNT(*) AS count FROM menu');
  const count = res.length > 0 && res[0].values.length > 0 ? res[0].values[0][0] : 0;

  if (count === 0) {
    const initialMenu = [
      ['Jollof Rice with Fried Chicken', 'Food', 45.00, 'jollof.jpg'],
      ['Banku with Tilapia', 'Food', 60.00, 'banku.jpg'],
      ['Fried Rice with Pork', 'Food', 50.00, 'fried_rice.jpg'],
      ['Continental Beef Burger & Chips', 'Food', 55.00, 'burger.jpg'],
      ['Don Simon (1L)', 'Drink', 25.00, 'don_simon.jpg'],
      ['Coca-Cola (50cl)', 'Drink', 10.00, 'coke.jpg'],
      ['Fanta Orange (50cl)', 'Drink', 10.00, 'fanta.jpg'],
      ['Sprite (50cl)', 'Drink', 10.00, 'sprite.jpg']
    ];

    const stmt = db.prepare('INSERT INTO menu (name, category, price, image) VALUES (?, ?, ?, ?)');
    initialMenu.forEach((item) => stmt.run(item));
    stmt.free();
    saveDatabase();
  }

  console.log('Database fully initialized and ready!');
  return db;
}

module.exports = {
  initDatabase,
  getDb: () => db,
  saveDatabase
};