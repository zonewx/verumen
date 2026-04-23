const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let db = null;

function initDB(dataDir) {
  const dbPath = path.join(dataDir, 'skins.db');

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('[db] Could not open skins.db:', err.message);
      return;
    }
    console.log('[db] SQLite database ready at', dbPath);

    db.serialize(() => {
      db.run('PRAGMA journal_mode = WAL');

      db.exec(`
        CREATE TABLE IF NOT EXISTS cs_inventory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          skin_name TEXT NOT NULL,
          exterior TEXT,
          float_value REAL,
          pattern INTEGER,
          stickers TEXT,
          purchase_price REAL NOT NULL DEFAULT 0,
          purchase_currency TEXT NOT NULL DEFAULT 'SEK',
          purchase_date TEXT NOT NULL,
          notes TEXT,
          steam_asset_id TEXT,
          image_url TEXT,
          sold INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cs_sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          inventory_id INTEGER NOT NULL REFERENCES cs_inventory(id) ON DELETE CASCADE,
          sale_price REAL NOT NULL,
          sale_currency TEXT NOT NULL DEFAULT 'SEK',
          sale_date TEXT NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cs_price_cache (
          skin_name TEXT PRIMARY KEY,
          price_usd REAL,
          price_sek REAL,
          last_updated TEXT
        );

        CREATE TABLE IF NOT EXISTS cs_settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `, (err) => {
        if (err) console.error('[db] Error creating tables:', err.message);
        else console.log('[db] All tables verified/created.');
      });
    });
  });

  return db;
}

function getDB() {
  return db;
}

module.exports = { initDB, getDB };
