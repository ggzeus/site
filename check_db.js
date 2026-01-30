const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'scarlet.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Erro ao abrir DB:", err);
        return;
    }
    console.log("DB aberto.");

    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
        if (err) {
            console.error("Erro ao listar tabelas:", err);
        } else {
            console.log("Tabelas encontradas:", rows);
        }

        // Verifica schema de comments se existir
        db.all("PRAGMA table_info(comments)", (err, rows) => {
            if (err) console.error("Erro schema comments:", err);
            else console.log("Schema comments:", rows);
        });
    });
});
