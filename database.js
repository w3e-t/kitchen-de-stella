const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'stella.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency performance
db.pragma('journal_mode = WAL');

// 1. Create Tables
db.exec(`
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

// 2. Safe Auto-Migrations for existing tables
try {
  db.exec("ALTER TABLE orders ADD COLUMN user_id INTEGER DEFAULT NULL");
} catch (e) { /* Column already exists */ }

try {
  db.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'Pending'");
} catch (e) { /* Column already exists */ }

try {
  db.exec("ALTER TABLE orders ADD COLUMN order_status TEXT DEFAULT 'Pending'");
} catch (e) { /* Column already exists */ }

// 3. Seed Default Menu Items
const countRow = db.prepare('SELECT COUNT(*) AS count FROM menu').get();

if (countRow && countRow.count === 0) {
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

  const insertStmt = db.prepare('INSERT INTO menu (name, category, price, image) VALUES (?, ?, ?, ?)');

  const seedTransaction = db.transaction((items) => {
    for (const item of items) {
      insertStmt.run(item);
    }
  });

  seedTransaction(initialMenu);
  console.log('Default menu seeded successfully.');
}

console.log('Connected to SQLite database: stella.db');

module.exports = db;