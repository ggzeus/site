const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const db = new sqlite3.Database(':memory:');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

db.serialize(() => {
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT)");
});

app.post('/register', async (req, res) => {
    const { user, pass } = req.body;
    
    const check = db.prepare("SELECT * FROM users WHERE username = ?");
    check.get(user, async (err, row) => {
        if (row) {
            res.status(400).json({ message: "Usuário já existe" });
        } else {
            const hash = await bcrypt.hash(pass, 10);
            const stmt = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)");
            stmt.run(user, hash, function(err) {
                if (err) res.status(500).json({ message: "Erro interno" });
                else res.status(200).json({ message: "Registrado com sucesso" });
            });
            stmt.finalize();
        }
    });
    check.finalize();
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    
    const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
    stmt.get(user, async (err, row) => {
        if (!row) {
            res.status(401).json({ message: "Credenciais inválidas" });
        } else {
            const match = await bcrypt.compare(pass, row.password);
            if (match) {
                res.status(200).json({ token: "sessao_valida", message: "Logado" });
            } else {
                res.status(401).json({ message: "Credenciais inválidas" });
            }
        }
    });
    stmt.finalize();
});

app.listen(3000, () => {
    console.log("Servidor rodando em http://localhost:3000");
});