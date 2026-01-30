const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Try to locate db based on common patterns or assume it's in ./database/
const dbPath = path.resolve(__dirname, 'database/scarlet.db'); // Check server.js for actual path if this fails.
// Wait, I recall "database" dir in file list.
// Let's check server.js top lines to be sure about DB path.
// But for now I'll guess 'database/database.db' or similar. 
// Actually, let's look at server.js imports first.

// Just reading server.js top lines would be safer. 
// But I'll try to guess based on standard practices if I don't want to use another tool.
// However, looking at file list: "database" (dir).
// I'll try to find the DB file name first.
const fs = require('fs');
const dbDir = path.resolve(__dirname, 'database');

if (fs.existsSync(dbDir)) {
    const files = fs.readdirSync(dbDir);
    const dbFile = files.find(f => f.endsWith('.db') || f.endsWith('.sqlite'));
    if (dbFile) {
        console.log(`Found DB: ${dbFile}`);
        const db = new sqlite3.Database(path.join(dbDir, dbFile));
        db.all("SELECT * FROM hwid_requests", (err, rows) => {
            if (err) console.log("Error:", err);
            else console.log("Rows:", rows);
        });
    } else {
        console.log("No DB file found in database/");
    }
} else {
    console.log("database/ dir not found");
}
