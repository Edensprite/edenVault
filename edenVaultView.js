const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./history.db', (err) => {
  if (err) {
    console.error('Failed to connect to the database', err);
  } else {
    console.log('Connected to SQLite database');
    db.all(`SELECT * FROM messages`, (err, rows) => {
      if (err) {
        console.error('Error retrieving data', err);
      } else {
        console.log('Messages:', rows);
      }
      db.close();
    });
  }
});
