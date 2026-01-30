const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'scarlet.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("Criando tabela chat_messages...");
    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        message TEXT,
        timestamp TEXT,
        created_at TEXT
    )`, (err) => {
        if (err) {
            console.error("Erro ao criar tabela:", err.message);
        } else {
            console.log("Tabela chat_messages criada com sucesso (ou já existia).");
        }
    });

    // Verificação extra
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'", (err, rows) => {
        if (rows && rows.length > 0) {
            console.log("✅ Confirmação: Tabela existe.");
        } else {
            console.log("❌ ERRO: Tabela ainda não existe.");
        }
    });
});
