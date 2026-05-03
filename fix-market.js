const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./10301972');

db.serialize(() => {
  db.run("DELETE FROM market_prices WHERE id='hammers'");
  const items = [
    ['weapons', 5.0, 5.0],
    ['armor', 10.0, 10.0],
    ['war_machines', 500.0, 500.0],
    ['land', 2000.0, 2000.0]
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO market_prices (id, current_price, base_price) VALUES (?, ?, ?)');
  items.forEach(item => {
    stmt.run(item);
  });
  stmt.finalize();
});
db.close(() => console.log('Market migrated'));
