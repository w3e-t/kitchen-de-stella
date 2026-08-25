const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'stella.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to SQLite database: stella.db');
  }
});

db.serialize(() => {
  // 1. Menu Items Table
  db.run(`
    CREATE TABLE IF NOT EXISTS menu (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      image TEXT NOT NULL
    )
  `);

  // 2. Users Table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullname TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'customer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Orders Table
  db.run(`
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
    )
  `);

  // Auto-migrations for existing tables
  db.run("ALTER TABLE orders ADD COLUMN user_id INTEGER DEFAULT NULL", () => {});
  db.run("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'Pending'", () => {});
  db.run("ALTER TABLE orders ADD COLUMN order_status TEXT DEFAULT 'Pending'", () => {});

  // Seed default menu items
  db.get('SELECT COUNT(*) AS count FROM menu', (err, row) => {
    if (row && row.count === 0) {
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
      stmt.finalize();
      console.log('Default menu seeded successfully.');
    }
  });
});

module.exports = db;