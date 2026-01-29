const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'scarlet.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco:', err.message);
        return;
    }
    console.log('Conectado ao banco de dados.');
});

db.serialize(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log('Tabelas encontradas:', tables);

        const hasChat = tables.some(t => t.name === 'chat_messages');
        if (hasChat) {
            console.log('✅ Tabela chat_messages existe.');
            db.all("SELECT * FROM chat_messages", (err, rows) => {
                console.log(`Mensagens salvas: ${rows ? rows.length : 0}`);
                if (rows && rows.length > 0) {
                    console.log('Última mensagem:', rows[rows.length - 1]);
                }
            });
        } else {
            console.log('❌ Tabela chat_messages NÃO encontrada.');
        }
    });
});
