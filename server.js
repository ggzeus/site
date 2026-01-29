const express = require('express');
const http = require('http'); // Import HTTP
const socketIo = require('socket.io'); // Import Socket.io
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi'); // Importa SDK da Efí

const app = express();
const crypto = require('crypto'); // Built-in node module
const server = http.createServer(app); // Create HTTP server
const io = socketIo(server); // Initialize Socket.io connected to server

// Garante que a pasta database existe
const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}

// Garante que a pasta uploads existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Conecta ao banco de dados em arquivo (Persistência)
const dbPath = path.join(dbDir, 'scarlet.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite (scarlet.db).');
        initializeDb();
    }
});

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

function initializeDb() {
    db.serialize(() => {
        // Tabela de Usuários
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            username TEXT UNIQUE, 
            email TEXT,
            password TEXT,
            role TEXT DEFAULT 'user'
        )`, () => {
            // Migração manual simples para adicionar a coluna role se ela nÃ£o existir
            db.all("PRAGMA table_info(users)", (err, rows) => {
                if (!err && rows) {
                    const hasRole = rows.some(r => r.name === 'role');
                    if (!hasRole) {
                        console.log("Migrando DB: Adicionando coluna 'role'...");
                        db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
                    }

                    const hasLimit = rows.some(r => r.name === 'upload_limit_gb');
                    if (!hasLimit) {
                        console.log("Migrando DB: Adicionando coluna 'upload_limit_gb'...");
                        db.run("ALTER TABLE users ADD COLUMN upload_limit_gb REAL DEFAULT 10"); // Default 10GB
                    }

                    const hasCreator = rows.some(r => r.name === 'is_content_creator');
                    if (!hasCreator) {
                        console.log("Migrando DB: Adicionando coluna 'is_content_creator'...");
                        db.run("ALTER TABLE users ADD COLUMN is_content_creator INTEGER DEFAULT 0");
                    }

                    const hasDev = rows.some(r => r.name === 'is_developer');
                    if (!hasDev) {
                        console.log("Migrando DB: Adicionando coluna 'is_developer'...");
                        db.run("ALTER TABLE users ADD COLUMN is_developer INTEGER DEFAULT 0");
                    }

                    const hasToken = rows.some(r => r.name === 'dev_token');
                    if (!hasToken) {
                        console.log("Migrando DB: Adicionando coluna 'dev_token'...");
                        db.run("ALTER TABLE users ADD COLUMN dev_token TEXT");
                    }
                }
            });
            seedAdminUser();
        });

        // Tabela de Licenças (Compras)
        db.run(`CREATE TABLE IF NOT EXISTS licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            product_id INTEGER,
            purchase_date TEXT,
            expires_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`, () => {
            // Migração: Adicionar expires_at se não existir
            db.all("PRAGMA table_info(licenses)", (err, rows) => {
                if (!err && rows) {
                    const hasExpires = rows.some(r => r.name === 'expires_at');
                    if (!hasExpires) {
                        console.log("Migrando DB: Adicionando coluna 'expires_at' em licenses...");
                        db.run("ALTER TABLE licenses ADD COLUMN expires_at TEXT");
                    }

                    // FIX: Atualizar licenças antigas (NULL) para ter uma data de validade
                    // Vamos dar 30 dias para quem já tinha, ou LIFETIME se preferir.
                    // O user pediu para ajustar o 'zeus'. Vamos ajustar todos para garantir.
                    db.run("UPDATE licenses SET expires_at = 'LIFETIME' WHERE expires_at IS NULL", (err) => {
                        if (!err && this.changes > 0) {
                            console.log("Migração: Licenças antigas atualizadas para LIFETIME (Fix)");
                        }
                    });
                }
            });
        });

        // Tabela de Pagamentos Pendentes (para webhook)
        db.run(`CREATE TABLE IF NOT EXISTS pending_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            txid TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            plan_type TEXT,
            amount REAL NOT NULL,
            status TEXT DEFAULT 'PENDING',
            created_at TEXT,
            paid_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(product_id) REFERENCES products(id)
        )`);


        // Tabela de Produtos (Novo)
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            type TEXT,
            category TEXT DEFAULT 'software',
            status TEXT,
            update_date TEXT,
            expires TEXT,
            price REAL,
            image_url TEXT
        )`, () => {
            // Migração para adicionar coluna category se não existir
            db.all("PRAGMA table_info(products)", (err, rows) => {
                if (!err && rows) {
                    const hasCategory = rows.some(r => r.name === 'category');
                    if (!hasCategory) {
                        console.log("Migrando DB: Adicionando coluna 'category'...");
                        db.run("ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'software'");
                    } else {
                        // Garante que produtos com category NULL sejam atualizados para 'software'
                        db.run("UPDATE products SET category = 'software' WHERE category IS NULL", (err) => {
                            if (!err) {
                                console.log("Migração: Produtos sem categoria atualizados para 'software'");
                            }
                        });
                    }

                    // Migração: Adicionar colunas de preços por plano
                    const hasPriceDaily = rows.some(r => r.name === 'price_daily');
                    if (!hasPriceDaily) {
                        console.log("Migrando DB: Adicionando colunas de preços por plano...");
                        db.run("ALTER TABLE products ADD COLUMN price_daily REAL DEFAULT 0");
                        db.run("ALTER TABLE products ADD COLUMN price_weekly REAL DEFAULT 0");
                        db.run("ALTER TABLE products ADD COLUMN price_monthly REAL DEFAULT 0");
                        db.run("ALTER TABLE products ADD COLUMN price_lifetime REAL DEFAULT 0");

                        // Migra preço antigo para price_monthly como padrão
                        db.run("UPDATE products SET price_monthly = price WHERE price > 0", (err) => {
                            if (!err) {
                                console.log("Migração: Preços antigos migrados para 'price_monthly'");
                            }
                        });
                    }

                    // Migração: Adicionar coluna seller_key
                    const hasSellerKey = rows.some(r => r.name === 'seller_key');
                    if (!hasSellerKey) {
                        console.log("Migrando DB: Adicionando coluna 'seller_key'...");
                        db.run("ALTER TABLE products ADD COLUMN seller_key TEXT");
                    }

                    // Migração: Adicionar coluna image_url
                    const hasImageUrl = rows.some(r => r.name === 'image_url');
                    if (!hasImageUrl) {
                        console.log("Migrando DB: Adicionando coluna 'image_url'...");
                        db.run("ALTER TABLE products ADD COLUMN image_url TEXT");
                    }

                    // Limpeza: Remover produtos "Duplicar Itens"
                    db.run("DELETE FROM products WHERE name LIKE '%Duplicar Itens%' OR name LIKE '%Duplicar Item%'", function (err) {
                        if (!err && this.changes > 0) {
                            console.log(`Limpeza: ${this.changes} produto(s) duplicado(s) removido(s)`);
                        }
                    });
                }
            });
            seedProducts();
        });

        // Tabela de Revendedores
        db.run(`CREATE TABLE IF NOT EXISTS resellers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            link TEXT,
            contact_method TEXT,
            logo_url TEXT,
            status TEXT DEFAULT 'Active'
        )`);

        // Tabela de Comentários (Docs)
        db.run(`CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id TEXT NOT NULL,
            user_id INTEGER,
            username TEXT,
            message TEXT,
            date TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Tabela de Posts do Feed Social
        db.run(`CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            media_url TEXT,
            media_type TEXT,
            caption TEXT,
            featured INTEGER DEFAULT 0,
            created_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Tabela de Curtidas nos Posts
        db.run(`CREATE TABLE IF NOT EXISTS post_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT,
            UNIQUE(post_id, user_id),
            FOREIGN KEY(post_id) REFERENCES posts(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Tabela de Comentários nos Posts
        db.run(`CREATE TABLE IF NOT EXISTS post_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT,
            FOREIGN KEY(post_id) REFERENCES posts(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Migração: Adicionar coluna is_content_creator na tabela users
        db.all("PRAGMA table_info(users)", (err, rows) => {
            if (!err && rows) {
                const hasContentCreator = rows.some(r => r.name === 'is_content_creator');
                if (!hasContentCreator) {
                    console.log("Migrando DB: Adicionando coluna 'is_content_creator'...");
                    db.run("ALTER TABLE users ADD COLUMN is_content_creator INTEGER DEFAULT 0");
                }
            }
        });

        // Tabela de Chat Global
        db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            message TEXT,
            timestamp TEXT,
            created_at TEXT
        )`);

        // Tabela de Memória da IA (Novo)
        db.run(`CREATE TABLE IF NOT EXISTS ai_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            term TEXT,
            definition TEXT,
            source TEXT DEFAULT 'user',
            created_at TEXT
        )`);

        // Migração: Settings Enhancements (Profile Pic, Theme)
        db.all("PRAGMA table_info(users)", (err, rows) => {
            if (!err && rows) {
                const hasPic = rows.some(r => r.name === 'profile_pic');
                if (!hasPic) {
                    console.log("Migrando DB: Adicionando coluna 'profile_pic'...");
                    db.run("ALTER TABLE users ADD COLUMN profile_pic TEXT");
                }
                const hasTheme = rows.some(r => r.name === 'theme_config');
                if (!hasTheme) {
                    console.log("Migrando DB: Adicionando coluna 'theme_config'...");
                    db.run("ALTER TABLE users ADD COLUMN theme_config TEXT");
                }
            }
        });

        // Tabela de Tickets
        db.run(`CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            subject TEXT,
            message TEXT,
            status TEXT DEFAULT 'Open',
            created_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Tabela de HWID Requests
        db.run(`CREATE TABLE IF NOT EXISTS hwid_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            product_id INTEGER,
            reason TEXT,
            status TEXT DEFAULT 'Pending',
            created_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);
    });
}

function seedAdminUser() {
    const adminUser = 'zeus';
    const adminPass = 'admin123'; // Senha padrão
    const adminEmail = 'zeus@scarlet.com';

    db.get("SELECT * FROM users WHERE username = ?", [adminUser], async (err, row) => {
        if (!row) {
            console.log("Criando usuário Admin 'zeus'...");
            const hash = await bcrypt.hash(adminPass, 10);
            const stmt = db.prepare("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)");
            stmt.run(adminUser, adminEmail, hash, 'admin');
            stmt.finalize();
        } else {
            // Se já existe, garante que é admin
            if (row.role !== 'admin') {
                console.log("Atualizando permissão de 'zeus' para Admin...");
                db.run("UPDATE users SET role = 'admin' WHERE id = ?", [row.id]);
            }
        }
    });
}

function seedProducts() {
    db.get("SELECT count(*) as count FROM products", (err, row) => {
        if (!err && row.count === 0) {
            console.log("Seeding Database com produtos padrão...");
            const initialProducts = [
                { name: 'Scarlet Menu', type: 'Mod Menu', category: 'software', status: 'Working', update: '27/01/2026', expires: '30 Dias', price: 25.00, seller_key: null },
                { name: 'Scarlet External', type: 'External ESP', category: 'software', status: 'Working', update: '25/01/2026', expires: 'Vitalício', price: 60.00, seller_key: '0e33f386b95f070382b00ca907886f53' },
                { name: 'Scarlet Roblox', type: 'Executor', category: 'software', status: 'Working', update: '20/01/2026', expires: '15 Dias', price: 15.00, seller_key: '949d913e199cb83ffef5de9e57535308' },
                { name: 'Scarlet Free-Fire', type: 'Mobile Injector', category: 'software', status: 'Working', update: '28/01/2026', expires: '30 Dias', price: 20.00, seller_key: '0c058836f16480c8398697a9d22afabf' },
                { name: 'Scarlet Spoofer', type: 'HWID Bypass', category: 'software', status: 'Working', update: '10/01/2026', expires: 'Vitalício', price: 50.00, seller_key: null },
                { name: 'Legit Config V1', type: 'CFG', category: 'addon', status: 'Working', update: '28/01/2026', expires: 'Vitalício', price: 0.00, seller_key: null }
            ];

            const stmt = db.prepare("INSERT INTO products (name, type, category, status, update_date, expires, price) VALUES (?, ?, ?, ?, ?, ?, ?)");
            initialProducts.forEach(p => {
                stmt.run(p.name, p.type, p.category, p.status, p.update, p.expires, p.price);
            });
            stmt.finalize();
        }
    });
}

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/register', async (req, res) => {
    const { user, pass, email } = req.body;

    if (!user || !pass || !email) {
        return res.status(400).json({ message: "Todos os campos são obrigatórios" });
    }

    db.get("SELECT * FROM users WHERE username = ? OR email = ?", [user, email], async (err, row) => {
        if (err) return res.status(500).json({ message: "Erro no servidor" });
        if (row) {
            return res.status(400).json({ message: "Usuário ou Email já cadastrado" });
        }

        try {
            const hash = await bcrypt.hash(pass, 10);
            const stmt = db.prepare("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)");
            // Novos users são 'user' por padrão
            stmt.run(user, email, hash, 'user', function (err) {
                if (err) return res.status(500).json({ message: "Erro ao registrar" });
                res.status(200).json({ message: "Registrado com sucesso" });
            });
            stmt.finalize();
        } catch (e) {
            res.status(500).json({ message: "Erro na criptografia" });
        }
    });
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [user], async (err, row) => {
        if (err) return res.status(500).json({ message: "Erro no servidor" });
        if (!row) {
            return res.status(401).json({ message: "Usuário não encontrado" });
        }

        const match = await bcrypt.compare(pass, row.password);
        if (match) {
            res.status(200).json({
                token: "sessao_valida",
                userId: row.id,
                username: row.username,
                email: row.email,
                role: row.role || 'user', // Retorna a role
                is_content_creator: row.is_content_creator,
                is_developer: row.is_developer,
                dev_token: row.dev_token,
                message: "Logado"
            });
        } else {
            res.status(401).json({ message: "Senha incorreta" });
        }
    });
});

app.post('/update-profile', async (req, res) => {
    const { userId, newEmail, newPassword } = req.body;
    if (!userId) return res.status(400).json({ message: "ID de usuário obrigatório" });

    if (newPassword && newEmail) {
        const hash = await bcrypt.hash(newPassword, 10);
        db.run("UPDATE users SET email = ?, password = ? WHERE id = ?", [newEmail, hash, userId], function (err) {
            if (err) return res.status(500).json({ message: "Erro ao atualizar" });
            res.json({ message: "Perfil atualizado com sucesso!" });
        });
    } else if (newEmail) {
        db.run("UPDATE users SET email = ? WHERE id = ?", [newEmail, userId], function (err) {
            if (err) return res.status(500).json({ message: "Erro ao atualizar" });
            res.json({ message: "Email atualizado com sucesso!" });
        });
    } else if (newPassword) {
        const hash = await bcrypt.hash(newPassword, 10);
        db.run("UPDATE users SET password = ? WHERE id = ?", [hash, userId], function (err) {
            if (err) return res.status(500).json({ message: "Erro ao atualizar" });
            res.json({ message: "Senha atualizada com sucesso!" });
        });
    } else {
        res.status(400).json({ message: "Nada para atualizar" });
    }
});

// Atualizar Configurações (Profile Pic e Tema)
app.put('/user/settings', (req, res) => {
    const { userId, profilePic, themeConfig } = req.body;

    if (!userId) return res.status(400).json({ message: "ID obrigatório" });

    const updates = [];
    const params = [];

    if (profilePic !== undefined) {
        updates.push("profile_pic = ?");
        params.push(profilePic);
    }
    if (themeConfig !== undefined) { // themeConfig deve ser string JSON
        updates.push("theme_config = ?");
        params.push(themeConfig);
    }

    if (updates.length === 0) return res.status(400).json({ message: "Nada para atualizar" });

    params.push(userId);

    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ message: "Erro ao atualizar settings" });
        res.json({ message: "Configurações salvas!" });
    });
});

// Obter Settings do Usuário
app.get('/user/settings/:userId', (req, res) => {
    const { userId } = req.params;
    db.get("SELECT profile_pic, theme_config FROM users WHERE id = ?", [userId], (err, row) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar settings" });
        res.json(row || {});
    });
});

// --- ROTAS DE SUPORTE (TICKETS & HWID) ---

app.post('/tickets', (req, res) => {
    const { userId, subject, message } = req.body;
    if (!userId || !subject || !message) return res.status(400).json({ message: "Campos obrigatórios" });

    const date = new Date().toISOString();
    const stmt = db.prepare("INSERT INTO tickets (user_id, subject, message, created_at) VALUES (?, ?, ?, ?)");
    stmt.run(userId, subject, message, date, function (err) {
        if (err) return res.status(500).json({ message: "Erro ao abrir ticket" });
        res.json({ message: "Ticket aberto com sucesso!", id: this.lastID });
    });
    stmt.finalize();
});

app.get('/tickets/:userId', (req, res) => {
    const { userId } = req.params;
    db.all("SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC", [userId], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar tickets" });
        res.json({ tickets: rows });
    });
});

app.post('/hwid-reset', (req, res) => {
    const { userId, productId, reason } = req.body;
    if (!userId || !productId || !reason) return res.status(400).json({ message: "Campos obrigatórios" });

    const date = new Date().toISOString();
    const stmt = db.prepare("INSERT INTO hwid_requests (user_id, product_id, reason, created_at) VALUES (?, ?, ?, ?)");
    stmt.run(userId, productId, reason, date, function (err) {
        if (err) return res.status(500).json({ message: "Erro ao solicitar reset" });
        res.json({ message: "Solicitação enviada!", id: this.lastID });
    });
    stmt.finalize();
});

app.get('/hwid-reset/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(`
        SELECT h.*, p.name as product_name 
        FROM hwid_requests h 
        JOIN products p ON h.product_id = p.id 
        WHERE h.user_id = ? 
        ORDER BY h.created_at DESC
    `, [userId], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar solicitações" });
        res.json({ requests: rows });
    });
});

// --- ROTAS DE PRODUTOS ---

// Listar produtos
app.get('/products', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar produtos" });
        res.status(200).json({ products: rows });
    });
});

// Criar produto (Admin only)
app.post('/products', (req, res) => {
    const { name, type, category, status, update, expires, price_daily, price_weekly, price_monthly, price_lifetime, seller_key, image_url, role } = req.body;

    console.log("Recebendo request POST /products:", req.body); // DEBUG

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    const stmt = db.prepare(`INSERT INTO products 
        (name, type, category, status, update_date, expires, price_daily, price_weekly, price_monthly, price_lifetime, seller_key, image_url) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(name, type, category || 'addon', status, update, expires,
        price_daily || 0, price_weekly || 0, price_monthly || 0, price_lifetime || 0, seller_key || null, image_url || null,
        function (err) {
            if (err) return res.status(500).json({ message: "Erro ao criar produto" });
            res.status(200).json({ message: "Produto criado com sucesso", id: this.lastID });
        });
    stmt.finalize();
});

// Atualizar produto (Admin only)
app.put('/products/:id', (req, res) => {
    const { id } = req.params;
    const { name, type, category, status, expires, price_daily, price_weekly, price_monthly, price_lifetime, seller_key, image_url, role } = req.body;

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    // Update dos campos editáveis no painel incluindo preços por plano
    const stmt = db.prepare(`UPDATE products SET 
        name = ?, type = ?, category = ?, status = ?, expires = ?, 
        price_daily = ?, price_weekly = ?, price_monthly = ?, price_lifetime = ?, seller_key = ?, image_url = ? 
        WHERE id = ?`);
    stmt.run(name, type, category, status, expires,
        price_daily || 0, price_weekly || 0, price_monthly || 0, price_lifetime || 0, seller_key || null, image_url || null,
        id, function (err) {
            if (err) return res.status(500).json({ message: "Erro ao atualizar produto" });
            res.status(200).json({ message: "Produto atualizado com sucesso" });
        });
    stmt.finalize();
});

// Deletar produto (Admin only)
app.delete('/products/:id', (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    db.run("DELETE FROM products WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).json({ message: "Erro ao deletar produto" });
        if (this.changes === 0) {
            return res.status(404).json({ message: "Produto não encontrado" });
        }
        res.status(200).json({ message: "Produto removido com sucesso" });
    });
});

// Buscar licenças
app.get('/licenses/:userId', (req, res) => {
    const userId = req.params.userId;
    db.all("SELECT product_id, expires_at FROM licenses WHERE user_id = ?", [userId], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar licenças" });
        // Retorna objeto com id e expiração
        const detailedLicenses = rows.map(row => ({
            product_id: row.product_id,
            expires_at: row.expires_at
        }));
        // Mantemos compatibilidade retornando também lista simples de IDs se necessário, 
        // mas o front novo usará o objeto completo.
        const productIds = rows.map(row => row.product_id);
        res.status(200).json({ licenses: productIds, details: detailedLicenses });
    });
});

// --- ROTAS DE REVENDEDORES ---

// Listar revendedores
app.get('/resellers', (req, res) => {
    db.all("SELECT * FROM resellers", (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar revendedores" });
        res.status(200).json({ resellers: rows });
    });
});

// Adicionar revendedor (Admin only)
app.post('/resellers', (req, res) => {
    const { name, link, contact_method, logo_url, role } = req.body;

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    const stmt = db.prepare("INSERT INTO resellers (name, link, contact_method, logo_url) VALUES (?, ?, ?, ?)");
    stmt.run(name, link, contact_method, logo_url || null, function (err) {
        if (err) return res.status(500).json({ message: "Erro ao adicionar revendedor" });
        res.status(200).json({ message: "Revendedor adicionado", id: this.lastID });
    });
    stmt.finalize();
});

// Deletar revendedor (Admin only)
app.delete('/resellers/:id', (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    db.run("DELETE FROM resellers WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).json({ message: "Erro ao remover revendedor" });
        res.status(200).json({ message: "Revendedor removido com sucesso" });
    });
});

// --- ROTAS DE COMENTÁRIOS (DOCS) ---

app.get('/comments/:topicId', (req, res) => {
    const { topicId } = req.params;
    console.log(`[DEBUG] GET /comments/${topicId} called`); // Debug log
    db.all("SELECT * FROM comments WHERE topic_id = ? ORDER BY id DESC", [topicId], (err, rows) => {
        if (err) {
            console.error(`[DEBUG] Error fetching comments: ${err.message}`);
            return res.status(500).json({ message: "Erro ao buscar comentários" });
        }
        console.log(`[DEBUG] Found ${rows.length} comments for ${topicId}`);
        res.status(200).json({ comments: rows });
    });
});

app.post('/comments', (req, res) => {
    const { topicId, userId, username, message } = req.body;
    console.log(`[DEBUG] POST /comments called with body:`, req.body); // Debug log
    const date = new Date().toISOString();

    if (!message || !message.trim()) {
        console.log(`[DEBUG] Empty message matched`);
        return res.status(400).json({ message: "Mensagem vazia." });
    }

    const stmt = db.prepare("INSERT INTO comments (topic_id, user_id, username, message, date) VALUES (?, ?, ?, ?, ?)");
    stmt.run(topicId, userId, username, message, date, function (err) {
        if (err) return res.status(500).json({ message: "Erro ao postar comentário" });
        res.status(200).json({ message: "Comentário enviado", id: this.lastID, date });
    });
    stmt.finalize();
});

// --- ROTAS DO FEED SOCIAL (PROMOTION) ---

// Listar todos os posts (featured primeiro, depois por data)
app.get('/posts', (req, res) => {
    const query = `
        SELECT 
            p.*,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes_count,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comments_count,
            u.is_content_creator
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        ORDER BY p.featured DESC, p.created_at DESC
    `;

    db.all(query, (err, rows) => {
        if (err) {
            console.error("Erro ao buscar posts:", err);
            return res.status(500).json({ message: "Erro ao buscar posts" });
        }
        res.status(200).json({ posts: rows });
    });
});

// Criar novo post
app.post('/posts', (req, res) => {
    const { userId, username, mediaUrl, mediaType, caption, isContentCreator } = req.body;

    if (!userId || !username || !mediaUrl || !mediaType) {
        return res.status(400).json({ message: "Dados incompletos" });
    }

    // Validação: Usuários normais só podem postar imagens
    if (!isContentCreator && mediaType === 'video') {
        return res.status(403).json({
            message: "Apenas Criadores de Conteúdo podem postar vídeos. Usuários normais podem postar apenas fotos."
        });
    }

    const createdAt = new Date().toISOString();
    const stmt = db.prepare(`INSERT INTO posts 
        (user_id, username, media_url, media_type, caption, created_at) 
        VALUES (?, ?, ?, ?, ?, ?)`);

    stmt.run(userId, username, mediaUrl, mediaType, caption || '', createdAt, function (err) {
        if (err) {
            console.error("Erro ao criar post:", err);
            return res.status(500).json({ message: "Erro ao criar post" });
        }
        res.status(200).json({
            message: "Post criado com sucesso",
            postId: this.lastID
        });
    });
    stmt.finalize();
});

// Deletar post (próprio post ou admin)
app.delete('/posts/:id', (req, res) => {
    const { id } = req.params;
    const { userId, role } = req.body;

    // Verifica se é o dono do post ou admin
    db.get("SELECT user_id FROM posts WHERE id = ?", [id], (err, post) => {
        if (err || !post) {
            return res.status(404).json({ message: "Post não encontrado" });
        }

        if (post.user_id !== userId && role !== 'admin') {
            return res.status(403).json({ message: "Sem permissão para deletar este post" });
        }

        // Deleta o post e seus relacionamentos
        db.run("DELETE FROM posts WHERE id = ?", [id], function (err) {
            if (err) return res.status(500).json({ message: "Erro ao deletar post" });

            // Deleta curtidas e comentários associados
            db.run("DELETE FROM post_likes WHERE post_id = ?", [id]);
            db.run("DELETE FROM post_comments WHERE post_id = ?", [id]);

            res.status(200).json({ message: "Post deletado com sucesso" });
        });
    });
});

// Toggle curtida (curtir/descurtir)
app.post('/posts/:id/like', (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ message: "userId obrigatório" });
    }

    // Verifica se já curtiu
    db.get("SELECT * FROM post_likes WHERE post_id = ? AND user_id = ?", [id, userId], (err, like) => {
        if (err) return res.status(500).json({ message: "Erro ao verificar curtida" });

        if (like) {
            // Já curtiu, então descurtir
            db.run("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", [id, userId], (err) => {
                if (err) return res.status(500).json({ message: "Erro ao descurtir" });
                res.status(200).json({ message: "Descurtido", liked: false });
            });
        } else {
            // Não curtiu, então curtir
            const stmt = db.prepare("INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)");
            stmt.run(id, userId, new Date().toISOString(), function (err) {
                if (err) return res.status(500).json({ message: "Erro ao curtir" });
                res.status(200).json({ message: "Curtido", liked: true });
            });
            stmt.finalize();
        }
    });
});

// Verificar se usuário curtiu um post
app.get('/posts/:id/liked', (req, res) => {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ message: "userId obrigatório" });
    }

    db.get("SELECT * FROM post_likes WHERE post_id = ? AND user_id = ?", [id, userId], (err, like) => {
        if (err) return res.status(500).json({ message: "Erro ao verificar curtida" });
        res.status(200).json({ liked: !!like });
    });
});

// Listar comentários de um post
app.get('/posts/:id/comments', (req, res) => {
    const { id } = req.params;

    db.all("SELECT * FROM post_comments WHERE post_id = ? ORDER BY created_at DESC", [id], (err, rows) => {
        if (err) {
            console.error("Erro ao buscar comentários:", err);
            return res.status(500).json({ message: "Erro ao buscar comentários" });
        }
        res.status(200).json({ comments: rows });
    });
});

// Adicionar comentário a um post
app.post('/posts/:id/comments', (req, res) => {
    const { id } = req.params;
    const { userId, username, message } = req.body;

    if (!message || !message.trim()) {
        return res.status(400).json({ message: "Comentário vazio" });
    }

    const createdAt = new Date().toISOString();
    const stmt = db.prepare(`INSERT INTO post_comments 
        (post_id, user_id, username, message, created_at) 
        VALUES (?, ?, ?, ?, ?)`);

    stmt.run(id, userId, username, message, createdAt, function (err) {
        if (err) {
            console.error("Erro ao adicionar comentário:", err);
            return res.status(500).json({ message: "Erro ao adicionar comentário" });
        }
        res.status(200).json({
            message: "Comentário adicionado",
            commentId: this.lastID,
            created_at: createdAt
        });
    });
    stmt.finalize();
});

// --- ROTA DE UPLOAD DE ARQUIVOS (BASE64 -> DISK) ---
app.post('/upload-old', (req, res) => {
    const { image } = req.body;
    if (!image) return res.status(400).json({ message: "Nenhuma imagem enviada" });

    // Regex para pegar tipo e dados
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

    if (!matches || matches.length !== 3) {
        return res.status(400).json({ message: "Formato de imagem inválido" });
    }

    const type = matches[1];
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');

    // Gera nome único
    const extension = type.split('/')[1] || 'png';
    const finalFilename = `upload_${Date.now()}_${Math.floor(Math.random() * 1000)}.${extension}`;
    const filePath = path.join(uploadsDir, finalFilename);

    fs.writeFile(filePath, buffer, (err) => {
        if (err) {
            console.error("Erro ao salvar arquivo no servidor:", err);
            return res.status(500).json({ message: "Erro ao salvar arquivo no servidor" });
        }

        // Sucesso: retorna URL pública
        // Como configuramos app.use(express.static(__dirname)), a pasta uploads já é servida
        const publicUrl = `/uploads/${finalFilename}`;
        res.status(200).json({ url: publicUrl });
    });
});

// --- ROTAS ADMIN PARA FEED ---

// Listar usuários (para admin gerenciar content creators)
app.get('/users/list', (req, res) => {
    const { role } = req.query;

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    db.all("SELECT id, username, email, is_content_creator, is_developer FROM users", (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar usuários" });
        res.status(200).json({ users: rows });
    });
});

// Toggle Content Creator status
app.put('/users/:id/creator', (req, res) => {
    const { id } = req.params;
    const { role, isContentCreator } = req.body;

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    const newStatus = isContentCreator ? 1 : 0;
    db.run("UPDATE users SET is_content_creator = ? WHERE id = ?", [newStatus, id], function (err) {
        if (err) return res.status(500).json({ message: "Erro ao atualizar usuário" });
        res.status(200).json({ message: "Status de Content Creator atualizado" });
    });
});

// Toggle Developer status
app.put('/users/:id/developer', (req, res) => {
    const { id } = req.params;
    const { role, isDeveloper } = req.body;

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    const newStatus = isDeveloper ? 1 : 0;

    // Check if we need to generate a token
    db.get("SELECT dev_token FROM users WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ message: "Erro interno" });

        let newToken = row.dev_token;
        if (newStatus === 1 && !newToken) {
            newToken = crypto.randomBytes(32).toString('hex');
        }

        db.run("UPDATE users SET is_developer = ?, dev_token = ? WHERE id = ?", [newStatus, newToken, id], function (err) {
            if (err) return res.status(500).json({ message: "Erro ao atualizar usuário" });
            res.status(200).json({ message: "Status de Desenvolvedor atualizado", dev_token: newToken });
        });
    });
});

// --- APIS PUBLICAS (DEV) ---

// Middleware para verificar token
const verifyDevToken = (req, res, next) => {
    const token = req.headers['x-dev-token'] || req.query.token;
    if (!token) {
        return res.status(401).json({ message: "Token de desenvolvedor não fornecido." });
    }

    db.get("SELECT * FROM users WHERE dev_token = ? AND is_developer = 1", [token], (err, user) => {
        if (err || !user) {
            return res.status(403).json({ message: "Token inválido ou revogado." });
        }
        req.devUser = user;
        next();
    });
};

app.get('/api/check-user', verifyDevToken, (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ message: "Username requerido." });

    db.get("SELECT id, username, role, is_content_creator FROM users WHERE username = ?", [username], (err, row) => {
        if (err) return res.status(500).json({ message: "Erro interno." });

        if (row) {
            res.json({
                exists: true,
                id: row.id,
                username: row.username,
                is_content_creator: !!row.is_content_creator
            });
        } else {
            res.json({ exists: false });
        }
    });
});

app.get('/api/check-creator', verifyDevToken, (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ message: "Username requerido." });

    db.get("SELECT is_content_creator FROM users WHERE username = ?", [username], (err, row) => {
        if (err) return res.status(500).json({ message: "Erro interno." });

        if (row && row.is_content_creator) {
            res.json({ is_creator: true });
        } else {
            res.json({ is_creator: false });
        }
    });
});


// Update User Upload Limit
app.put('/users/:id/limit', (req, res) => {
    const { id } = req.params;
    const { role, limitGB } = req.body;

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    db.run("UPDATE users SET upload_limit_gb = ? WHERE id = ?", [limitGB, id], function (err) {
        if (err) return res.status(500).json({ message: "Erro ao atualizar limite" });
        res.status(200).json({ message: "Limite de upload atualizado" });
    });
});

// Toggle post featured status (Admin only)
app.put('/posts/:id/feature', (req, res) => {
    const { id } = req.params;
    const { role, featured } = req.body;

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    const newFeatured = featured ? 1 : 0;
    db.run("UPDATE posts SET featured = ? WHERE id = ?", [newFeatured, id], function (err) {
        if (err) return res.status(500).json({ message: "Erro ao atualizar post" });
        res.status(200).json({ message: "Status de destaque atualizado" });
    });
});

// --- ROTA DE SEND UPDATE (ZEUS) ---
app.post('/api/send-update', (req, res) => {
    const { message, productId, role, productName } = req.body;

    console.log(`[DEBUG] /api/send-update chamada. Role: ${role}, Product: ${productName}, Msg: ${message}`);

    if (role !== 'admin') {
        console.log(`[DEBUG] Acesso negado. Role recebida: ${role}`);
        return res.status(403).json({ message: "Acesso negado" });
    }

    if (!message || !productId) {
        return res.status(400).json({ message: "Dados incompletos" });
    }

    // 1. Atualiza Data do Produto
    const today = new Date().toLocaleDateString('pt-BR');
    db.run("UPDATE products SET update_date = ?, status = 'Working' WHERE id = ?", [today, productId], (err) => {
        if (err) console.error("Erro ao atualizar data do produto:", err);
    });

    // 2. Posta no Feed (Opcional - Sistema)
    // Busca usuário admin ou sistema (ID 1 ou user 'zeus')
    db.get("SELECT id, username FROM users WHERE role = 'admin' LIMIT 1", (err, adminUser) => {
        if (err || !adminUser) {
            console.error("Erro ao buscar admin para postar no feed. Erro:", err, "User:", adminUser);
        } else {
            console.log(`[DEBUG] Admin encontrado para post: ${adminUser.username} (ID: ${adminUser.id})`);
            const createdAt = new Date().toISOString();
            // Insere post no feed
            // Usaremos uma imagem padrão de update ou o logo
            const updateImage = 'https://i.imgur.com/3s3s3s3.png'; // Placeholder ou pedir para user configurar
            const stmt = db.prepare(`INSERT INTO posts 
                (user_id, username, media_url, media_type, caption, created_at, featured) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`);

            // Caption formatada
            const caption = `🚀 **NOTAS DE ATUALIZAÇÃO** - ${productName}\n\n${message}`;

            stmt.run(adminUser.id, adminUser.username, updateImage, 'image', caption, createdAt, 1, (err) => {
                if (err) console.error("Erro ao postar update no feed:", err);
                else console.log("Update postado no feed com sucesso!");
            });
            stmt.finalize();
        }
    });

    // 3. Envia para Discord Webhook
    const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1466491210968334568/VxGZ6x7Q9WACVXWOnoYHx7m5YruCI7K5JYQj4xGmDjsQyXJm4a1QK3sOlXa-VJ2pEfMz';

    if (DISCORD_WEBHOOK_URL) {
        // Formata a mensagem para Discord
        const discordBody = {
            content: "@everyone",
            embeds: [{
                title: `🚀 Nova Atualização: ${productName}`,
                description: message,
                color: 5763719, // #57F287 (Green/Cyan)
                footer: {
                    text: `Atualizado em ${today} • Painel Zeus`
                },
                timestamp: new Date().toISOString()
            }]
        };

        // Envia Webhook (async, sem await para não bloquear response, mas com log)
        console.log(`[DEBUG] Enviando Webhook para: ${DISCORD_WEBHOOK_URL}`);
        fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordBody)
        })
            .then(res => {
                if (!res.ok) console.error(`Erro Webhook Discord: ${res.status} ${res.statusText}`);
                else console.log("Webhook enviado ao Discord!");
            })
            .catch(err => console.error("Erro ao enviar webhook:", err));
    } else {
        console.warn("Webhook do Discord não configurado em server.js");
    }

    res.status(200).json({ message: "Atualização enviada e postada no feed!" });
});

// --- API EFÍ PAY (PIX) ---


// CONFIGURAÇÃO: INSIRA SUAS CREDENCIAIS AQUI
// IMPORTANTE: Para SANDBOX, use credenciais e certificado de HOMOLOGAÇÃO
// Para PRODUÇÃO, use credenciais e certificado de PRODUÇÃO
const IS_SANDBOX = false; // MUDE PARA false QUANDO FOR PARA PRODUÇÃO

// Determina qual certificado usar baseado no ambiente
const certFileName = IS_SANDBOX ? 'homologacao.p12' : 'producao.p12';
const certPath = path.join(__dirname, 'certs', certFileName);

// Verifica se o certificado existe
if (!fs.existsSync(certPath)) {
    console.error(`❌ ERRO CRÍTICO: Certificado não encontrado: ${certPath}`);
    console.error(`   Para ${IS_SANDBOX ? 'SANDBOX' : 'PRODUÇÃO'}, você precisa do certificado: ${certFileName}`);
    console.error(`   Baixe o certificado no painel Efí Bank e coloque em: ${path.join(__dirname, 'certs')}`);
} else {
    console.log(`✅ Certificado encontrado: ${certPath}`);
}

const efiOptions = {
    sandbox: IS_SANDBOX,
    client_id: 'Client_Id_e3dae946d76f6a014d54d4bf69cd22811753bfcf',
    client_secret: 'Client_Secret_28e136b42ce477782b15824bf63d551d16afced4',
    certificate: certPath,
    // Descomente a linha abaixo se seu certificado estiver em base64
    // cert_base64: true
};

// Chave PIX cadastrada na conta Efí (deve corresponder ao ambiente sandbox/produção)
const PIX_KEY = 'themitido@gmail.com'; // Sua chave PIX cadastrada

// Validação das credenciais
if (efiOptions.client_id === 'SEU_CLIENT_ID' || efiOptions.client_id.includes('SEU_')) {
    console.warn("⚠️ AVISO: Credenciais Efí Pay não configuradas em server.js");
} else {
    console.log(`✅ Credenciais Efí Pay configuradas (ambiente: ${IS_SANDBOX ? 'SANDBOX' : 'PRODUÇÃO'})`);
}

// --- KEYAUTH CONFIGURATION ---
const KEYAUTH_SELLER_KEY = 'SUA_SELLER_KEY_AQUI'; // CONFIGURE SUA SELLER KEY AQUI

if (KEYAUTH_SELLER_KEY === 'SUA_SELLER_KEY_AQUI') {
    console.warn("AVISO: KeyAuth Seller Key não configurada em server.js");
}

// Endpoint para gerar licença via KeyAuth
app.post('/keyauth/generate', async (req, res) => {
    const { productId, planType, userId } = req.body;

    // Busca informações do produto
    db.get("SELECT * FROM products WHERE id = ?", [productId], async (err, product) => {
        if (err || !product) {
            return res.status(404).json({ message: "Produto não encontrado" });
        }

        // Verifica se o produto tem seller_key configurada
        const sellerKey = product.seller_key || KEYAUTH_SELLER_KEY;
        if (!sellerKey || sellerKey === 'SUA_SELLER_KEY_AQUI') {
            return res.status(500).json({ message: "Seller Key não configurada para este produto" });
        }

        // Calcula expiração baseado no tipo de plano
        let expiry = 1; // padrão 1 dia
        switch (planType) {
            case 'daily':
                expiry = 1;
                break;
            case 'weekly':
                expiry = 7;
                break;
            case 'monthly':
                expiry = 30;
                break;
            case 'lifetime':
                expiry = 999999; // KeyAuth aceita valores grandes para lifetime
                break;
        }

        try {
            // Chama API do KeyAuth para gerar licença
            const keyauthUrl = `https://keyauth.win/api/seller/?sellerkey=${sellerKey}&type=add&format=JSON&expiry=${expiry}&mask=SCARLET-**********&level=1&amount=1&owner=${userId}&note=Auto-generated via Scarlet Panel`;

            const response = await fetch(keyauthUrl);
            const data = await response.json();

            if (data.success) {
                // Retorna a key gerada
                const generatedKey = data.key || data.message;
                res.status(200).json({
                    success: true,
                    license: generatedKey,
                    message: "Licença gerada com sucesso"
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: data.message || "Erro ao gerar licença no KeyAuth"
                });
            }
        } catch (error) {
            console.error("Erro ao chamar KeyAuth API:", error);
            res.status(500).json({ message: "Erro ao comunicar com KeyAuth API" });
        }
    });
});

app.post('/pay/pix', async (req, res) => {
    const { userId, productId, planType, price } = req.body;

    console.log('💳 Requisição /pay/pix recebida:');
    console.log('   userId:', userId);
    console.log('   productId:', productId);
    console.log('   planType:', planType);
    console.log('   price:', price);
    console.log('   Ambiente:', IS_SANDBOX ? 'SANDBOX' : 'PRODUÇÃO');

    // Verifica se o certificado existe antes de tentar
    if (!fs.existsSync(efiOptions.certificate)) {
        console.error('❌ Certificado não encontrado:', efiOptions.certificate);
        return res.status(500).json({
            message: `Certificado digital não encontrado. Verifique se o arquivo ${certFileName} existe na pasta /certs/`
        });
    }

    // Busca dados do produto para saber o valor
    db.get("SELECT * FROM products WHERE id = ?", [productId], async (err, product) => {
        if (err || !product) {
            console.error('❌ Produto não encontrado:', productId);
            return res.status(404).json({ message: "Produto não encontrado no servidor." });
        }

        console.log('✅ Produto encontrado:', product.name);

        // Usa o preço enviado do frontend (do plano selecionado) ou fallback
        const finalPrice = price || product.price_monthly || product.price || 1.00;

        console.log('💰 Preço final:', finalPrice);
        console.log('🔑 Chave PIX:', PIX_KEY);

        // Corpo da requisição para criar cobrança imediata
        // IMPORTANTE: O campo "devedor" é OPCIONAL para cobranças imediatas
        const body = {
            calendario: {
                expiracao: 3600 // 1 hora de validade
            },
            valor: {
                original: finalPrice.toFixed(2)
            },
            chave: PIX_KEY, // Chave PIX cadastrada na conta Efí
            solicitacaoPagador: `Scarlet - ${product.name} (${planType || 'Plano Único'})`
        };

        console.log('📦 Body da requisição:', JSON.stringify(body, null, 2));

        try {
            console.log('🔄 Criando instância EfiPay...');
            const efipay = new EfiPay(efiOptions);

            // Cria cobrança imediata
            console.log('🔄 Criando cobrança imediata...');
            const cobranca = await efipay.pixCreateImmediateCharge([], body);
            console.log('✅ Cobrança criada:', JSON.stringify(cobranca, null, 2));

            // Gera QR Code
            console.log('🔄 Gerando QR Code...');
            const params = {
                id: cobranca.loc.id
            };
            const qrcode = await efipay.pixGenerateQRCode(params);
            console.log('✅ QR Code gerado com sucesso');

            // Salva pagamento pendente no banco para processar no webhook
            const stmt = db.prepare(`INSERT INTO pending_payments 
                (txid, user_id, product_id, plan_type, amount, status, created_at) 
                VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`);
            stmt.run(cobranca.txid, userId, productId, planType || 'unique', finalPrice, new Date().toISOString());
            stmt.finalize();

            console.log('✅ Pagamento pendente salvo no banco. TXID:', cobranca.txid);

            res.status(200).json({
                message: "Cobrança criada",
                qrcode: qrcode.imagemQrcode,
                copiaecola: qrcode.qrcode,
                txid: cobranca.txid
            });

        } catch (error) {
            console.error("❌ Erro ao gerar PIX:");
            console.error("   Tipo do erro:", typeof error);
            console.error("   Erro completo (JSON):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
            console.error("   Mensagem:", error.message);
            console.error("   Código:", error.code);
            console.error("   Nome:", error.name);
            console.error("   Stack:", error.stack);
            console.error("   Response:", error.response?.data || 'N/A');
            console.error("   Error.toString():", error.toString());

            // Tenta extrair mais detalhes do erro da API Efí
            // A API Efí pode retornar erro em diferentes formatos
            const errorDetails = error.error_description ||  // Formato direto do SDK
                error.error ||
                error.response?.data?.mensagem ||
                error.response?.data?.message ||
                error.response?.data?.error_description ||
                error.message ||
                'Erro desconhecido ao comunicar com Efí Pay';

            // Erro específico: Certificado não corresponde às credenciais
            if (error.error === 'invalid_token' || error.error_description?.includes('certificate')) {
                return res.status(500).json({
                    message: `❌ CERTIFICADO INVÁLIDO: O certificado ${certFileName} não corresponde às credenciais configuradas. Verifique se o certificado e as credenciais (client_id e client_secret) foram gerados para a mesma aplicação no painel Efí Pay.`
                });
            }

            // Retorna erro detalhado para o usuário
            if (error.message?.includes('certificate') || error.message?.includes('ENOENT') || error.code === 'ENOENT') {
                return res.status(500).json({
                    message: `Certificado digital do Efí Pay não encontrado. Configure o certificado ${certFileName} em /certs/`
                });
            }

            // Erro de versão do OpenSSL (Node.js 17+)
            if (error.message?.includes('Unsupported') || error.message?.includes('legacy') || error.code === 'ERR_OSSL_EVP_UNSUPPORTED') {
                return res.status(500).json({
                    message: "Erro de compatibilidade OpenSSL. Tente iniciar o servidor com: NODE_OPTIONS=--openssl-legacy-provider node server.js"
                });
            }

            // Erro de autenticação (401)
            if (error.message?.includes('401') || error.response?.status === 401) {
                return res.status(500).json({
                    message: "Erro de autenticação com Efí Pay. Verifique se as credenciais correspondem ao ambiente (sandbox/produção)."
                });
            }

            // Erro de chave PIX
            if (error.message?.includes('chave') || error.message?.includes('PIX key') || errorDetails?.includes('chave')) {
                return res.status(500).json({
                    message: `Chave PIX '${PIX_KEY}' inválida ou não cadastrada na sua conta Efí Pay.`
                });
            }

            // Erro de conexão
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
                return res.status(500).json({
                    message: "Falha de conexão com o servidor Efí Pay. Verifique sua conexão com a internet."
                });
            }

            // Erro genérico com detalhes
            return res.status(500).json({
                message: `Erro ao gerar PIX: ${errorDetails}`,
                details: error.code || error.error || 'Erro desconhecido'
            });
        }
    });
});

// --- WEBHOOK EFÍ PAY ---
// Este endpoint recebe notificações automáticas quando um PIX é pago
app.post('/webhook/efi', async (req, res) => {
    console.log('📩 Webhook Efí Pay recebido:', JSON.stringify(req.body, null, 2));

    const { pix } = req.body;

    if (!pix || pix.length === 0) {
        console.log('⚠️ Webhook sem dados de PIX');
        return res.status(200).send('OK'); // Retorna 200 para não reenviar
    }

    // Processa cada notificação PIX
    for (const pixNotification of pix) {
        const { txid } = pixNotification;

        if (!txid) {
            console.log('⚠️ Notificação sem TXID');
            continue;
        }

        try {
            // Consulta detalhes da cobrança no Efí Pay
            const efipay = new EfiPay(efiOptions);
            const params = { txid };
            const cobranca = await efipay.pixDetailCharge(params);

            console.log('💰 Detalhes da cobrança:', JSON.stringify(cobranca, null, 2));

            // Verifica se o pagamento foi confirmado
            if (cobranca.status === 'CONCLUIDA') {
                const { valor, txid, solicitacaoPagador } = cobranca;

                // Extrai informações do pagamento (você pode armazenar productId e userId no solicitacaoPagador)
                // Formato esperado: "Pagamento Scarlet - ProductName (planType) - userId:123 - productId:456"

                // Por enquanto, vamos apenas logar e você pode implementar a lógica de associação
                console.log('✅ Pagamento confirmado!');
                console.log(`   Valor: R$ ${valor.original}`);
                console.log(`   TXID: ${txid}`);
                console.log(`   Descrição: ${solicitacaoPagador}`);

                // Busca o pagamento pendente no banco
                db.get("SELECT * FROM pending_payments WHERE txid = ? AND status = 'PENDING'", [txid], async (err, payment) => {
                    if (err || !payment) {
                        console.log('⚠️ Pagamento não encontrado ou já processado');
                        return;
                    }

                    const { user_id, product_id, plan_type } = payment;

                    try {
                        // 1. Registra licença no banco
                        // Lógica de validade
                        let expiresAt = null;
                        if (plan_type === 'lifetime') {
                            expiresAt = 'LIFETIME';
                        } else {
                            let days = 30; // Default mensal
                            if (plan_type === 'daily') days = 1;
                            if (plan_type === 'weekly') days = 7;

                            const date = new Date();
                            date.setDate(date.getDate() + days);
                            expiresAt = date.toISOString();
                        }

                        const stmtLicense = db.prepare(`INSERT OR IGNORE INTO licenses 
                            (user_id, product_id, purchase_date, expires_at) VALUES (?, ?, ?, ?)`);
                        stmtLicense.run(user_id, product_id, new Date().toISOString(), expiresAt);
                        stmtLicense.finalize();

                        console.log(`📝 Licença registrada para user_id: ${user_id}, product_id: ${product_id}, expires: ${expiresAt}`);

                        // 2. Gera licença KeyAuth se configurado
                        db.get("SELECT * FROM products WHERE id = ?", [product_id], async (err, product) => {
                            if (!err && product) {
                                const sellerKey = product.seller_key || KEYAUTH_SELLER_KEY;

                                if (sellerKey && sellerKey !== 'SUA_SELLER_KEY_AQUI') {
                                    // Calcula expiração baseado no plano
                                    let expiry = 30; // padrão mensal
                                    switch (plan_type) {
                                        case 'daily': expiry = 1; break;
                                        case 'weekly': expiry = 7; break;
                                        case 'monthly': expiry = 30; break;
                                        case 'lifetime': expiry = 999999; break;
                                    }

                                    try {
                                        const keyauthUrl = `https://keyauth.win/api/seller/?sellerkey=${sellerKey}&type=add&format=JSON&expiry=${expiry}&mask=SCARLET-**********&level=1&amount=1&owner=${user_id}&note=Auto-generated via Webhook - TXID: ${txid}`;
                                        const response = await fetch(keyauthUrl);
                                        const data = await response.json();

                                        if (data.success) {
                                            console.log(`🔑 Licença KeyAuth gerada: ${data.key || data.message}`);
                                            // TODO: Salvar a key gerada em uma tabela ou enviar por email
                                        }
                                    } catch (error) {
                                        console.error('❌ Erro ao gerar licença KeyAuth:', error.message);
                                    }
                                }
                            }
                        });

                        // 3. Atualiza status do pagamento
                        const stmtUpdate = db.prepare(`UPDATE pending_payments 
                            SET status = 'COMPLETED', paid_at = ? WHERE txid = ?`);
                        stmtUpdate.run(new Date().toISOString(), txid);
                        stmtUpdate.finalize();

                        console.log('✅ Pagamento processado com sucesso!');

                    } catch (error) {
                        console.error('❌ Erro ao processar pagamento:', error);
                    }
                });

            } else {
                console.log(`ℹ️ Pagamento ainda não concluído. Status: ${cobranca.status}`);
            }

        } catch (error) {
            console.error('❌ Erro ao processar webhook:', error.message);
        }
    }

    // Sempre retorna 200 para o Efí Pay não reenviar
    res.status(200).send('OK');
});

// Endpoint para registrar compra (Chamado após confirmação - ou webhook)
// Por enquanto mantemos o endpoint manual que o front chama após "verificar" (Simulado)
app.post('/purchase', (req, res) => {
    const { userId, productId } = req.body;
    // ... codigo anterior de purchase ... (mantido igual ou adaptado)
    if (!userId || !productId) return res.status(400).json({ message: "Dados inválidos" });

    db.get("SELECT * FROM licenses WHERE user_id = ? AND product_id = ?", [userId, productId], (err, row) => {
        if (row) return res.status(200).json({ message: "Já possui este produto" });

        // Calcula expiração
        let expiresAt = null;
        // Se comprado direto sem plano (legado), assume mensal ou pega do cadastro do produto
        // Aqui simplificamos: se tem 'expires' no produto DB, usamos.
        db.get("SELECT expires FROM products WHERE id = ?", [productId], (err, prod) => {
            if (prod && prod.expires) {
                const lower = prod.expires.toLowerCase();
                if (lower.includes('vitalício') || lower.includes('lifetime')) {
                    expiresAt = 'LIFETIME';
                } else if (lower.includes('dia')) {
                    const days = parseInt(prod.expires) || 30;
                    const d = new Date();
                    d.setDate(d.getDate() + days);
                    expiresAt = d.toISOString();
                } else {
                    // Default fallback
                    const d = new Date();
                    d.setDate(d.getDate() + 30);
                    expiresAt = d.toISOString();
                }
            }

            const stmt = db.prepare("INSERT INTO licenses (user_id, product_id, purchase_date, expires_at) VALUES (?, ?, ?, ?)");
            const now = new Date().toISOString();
            stmt.run(userId, productId, now, expiresAt, function (err) {
                if (err) return res.status(500).json({ message: "Erro ao processar compra" });
                res.status(200).json({ message: "Compra registrada com sucesso" });
            });
            stmt.finalize();
        });
    });
});

// --- AI HELPER ENDPOINTS ---

const AI_SYNONYMS = {
    "buy": ["purchase", "get", "acquire", "comprar", "adquirir", "pegue"],
    "help": ["support", "assist", "ajuda", "suporte", "socorro"],
    "error": ["bug", "fail", "crash", "erro", "falha", "problema", "não funciona"],
    "config": ["cfg", "setting", "setup", "configuração", "ajuste"],
    "inject": ["load", "execute", "injetar", "carregar", "executar"],
    "ban": ["detect", "detected", "banimento", "banido"]
};

// Simple function to expand query with synonyms
function expandQuery(query) {
    const words = query.toLowerCase().split(' ');
    let expanded = [...words];

    words.forEach(w => {
        for (const key in AI_SYNONYMS) {
            if (key === w || AI_SYNONYMS[key].includes(w)) {
                expanded.push(key); // Add canonical term
                expanded = expanded.concat(AI_SYNONYMS[key]);
            }
        }
    });
    return [...new Set(expanded)]; // Unique words
}

app.post('/api/ai/chat', (req, res) => {
    // AI Disabled as per user request
    return res.json({ response: "A IA está temporariamente desativada para manutenção." });

    /*
    const { message, userId } = req.body;
    if (!message) return res.status(400).json({ message: "Mensagem vazia" });
    
    const lowerMsg = message.toLowerCase();
    
    // 1. LEARNING MODE: "X significa Y" ou "X means Y"
    // Regex simples para capturar definições
    const learnRegex = /(?:(.+) (?:significa|means|é igual a|é o mesmo que) (.+))/i;
    const learnMatch = lowerMsg.match(learnRegex);
    
    if (learnMatch && learnMatch.length === 3) {
        const term = learnMatch[1].trim();
        const definition = learnMatch[2].trim();
    
        // Evita aprender se for uma pergunta
        if (!term.includes('?') && !definition.includes('?')) {
            const stmt = db.prepare("INSERT INTO ai_memory (term, definition, source, created_at) VALUES (?, ?, 'user_learning', ?)");
            stmt.run(term, definition, new Date().toISOString(), (err) => {
                if (err) {
                    console.error("Erro ao aprender:", err);
                    return res.json({ response: "Tive um problema ao tentar memorizar isso." });
                }
                return res.json({ response: `Entendi! Aprendi que **"${term}"** significa **"${definition}"**. Obrigado por me ensinar!` });
            });
            stmt.finalize();
            return; // Encerra aqui se for aprendizado
        }
    }
    
    // 2. RESEARCH MODE: Buscar na base de dados
    const expandedTerms = expandQuery(message);
    let bestResponse = null;
    let productsFound = [];
    let docsFound = [];
    
    // Prepara queries (Promessas para rodar em paralelo se quisesse, mas SQLite é síncrono na lib padrão, então aninhado)
    
    // Busca em Memória (AI Memory)
    db.all("SELECT * FROM ai_memory", (err, memories) => {
        if (!err && memories) {
            // Busca 'fuzzy' simples
            const memory = memories.find(m => lowerMsg.includes(m.term.toLowerCase()));
            if (memory) {
                bestResponse = `Lembro que aprendi sobre isso: **${memory.term}** significa _"${memory.definition}"_.`;
            }
        }
    
        // Busca em Produtos
        db.all("SELECT * FROM products", (err, products) => {
            if (!err && products) {
                products.forEach(p => {
                    if (expandedTerms.some(term => p.name.toLowerCase().includes(term) || p.type.toLowerCase().includes(term))) {
                        productsFound.push(p.name);
                    }
                });
            }
    
            // Busca em Docs (Soluções de erro)
            // Docs são hardcoded no front, mas poderiam estar no banco. 
            // Vamos simular respostas baseadas em keywords comuns de erro se não tiver tabela docs (a tabela comments existe, mas tabela docs não parecia existir no create table, era array no front).
            // MAS espera, script.js linha 1443 tem `docsData`. O server não tem tabela de docs de conteúdo, só comentários.
            // Vamos usar lógica de keywords de erro genéricas.
    
            if (expandedTerms.includes('error') || expandedTerms.includes('erro') || expandedTerms.includes('falha')) {
                docsFound.push("Verificar Data e Hora do Windows");
                docsFound.push("Instalar Visual C++ Redistributable");
                docsFound.push("Desativar Antivírus");
            }
    
            // JOIN RESULTS
            if (!bestResponse) {
                if (productsFound.length > 0) {
                    bestResponse = `Encontrei estes produtos relacionados: **${productsFound.join(', ')}**. Você pode vê-los na aba de Instalação ou Addons.`;
                } else if (docsFound.length > 0) {
                    bestResponse = `Parece que você está com problemas. Sugiro tentar: \n- ${docsFound.join('\n- ')}\n\nConsulte a aba **Docs** para soluções detalhadas.`;
                } else if (lowerMsg.includes('oi') || lowerMsg.includes('ola') || lowerMsg.includes('hello')) {
                    bestResponse = "Olá! Sou a IA da Scarlet. Posso ajudar com produtos, erros ou dúvidas gerais. Posso pesquisar na internet se precisar!";
                } else {
                    // Fallback: "Não sei, pesquisei na internet..." (Simulado)
                    // Num app real, chamaria Google Search API aqui.
                    bestResponse = `Hum, não tenho certeza sobre "${message}". Pesquisei em minhas fontes e não encontrei nada específico. \n\nVocê pode me ensinar dizendo: **"${message} significa [Sua Definição]"**.`;
                }
            }
    
            res.json({ response: bestResponse });
        });
    });
    */
});

// Endpoint de Resgate de Key (Integração KeyAuth)
app.post('/redeem-key', (req, res) => {
    const { userId, key } = req.body;

    if (!userId || !key) return res.status(400).json({ message: 'Dados incompletos.' });

    // Testa key de teste primeiro
    if (key === 'TEST-KEY-123') {
        return res.json({ success: true, productName: 'Pacote de Teste (Simulação)' });
    }

    // Busca todos os produtos que possuem integração KeyAuth (seller_key definida)
    db.all("SELECT id, name, seller_key FROM products WHERE seller_key IS NOT NULL AND seller_key != ''", async (err, products) => {
        if (err) {
            console.error("Erro ao buscar produtos para validação:", err);
            return res.status(500).json({ message: 'Erro interno ao validar key.' });
        }

        if (!products || products.length === 0) {
            return res.status(404).json({ message: 'Nenhum produto configurado para validação externa.' });
        }

        let activatedProduct = null;
        let SuccessMsg = "";

        // Tenta validar a key em cada produto configurado
        // (Isso é um "brute-force" nos apps do vendedor, já que não sabemos de qual app é a key)
        for (const prod of products) {
            try {
                // Endpoint 'verify' do KeyAuth Seller API
                // Documentação: https://keyauth.cc/seller/
                const url = `https://keyauth.win/api/seller/?sellerkey=${prod.seller_key}&type=verify&key=${key}&format=JSON`;

                const apiRes = await fetch(url);
                const data = await apiRes.json();

                if (data.success) {
                    activatedProduct = prod;
                    SuccessMsg = data.message || "Key Válida";
                    break; // Encontrou! Para de procurar.
                }
            } catch (e) {
                console.error(`Erro ao validar key para o produto ${prod.name}:`, e.message);
                // Continua tentando outros produtos...
            }
        }

        if (activatedProduct) {
            // Key válida encontrada! Registrar licença localmente.
            console.log(`✅ Key válida encontrada para produto: ${activatedProduct.name}`);

            db.get("SELECT * FROM licenses WHERE user_id = ? AND product_id = ?", [userId, activatedProduct.id], (err, row) => {
                if (row) {
                    return res.status(200).json({ message: `Você já possui a licença de ${activatedProduct.name}.`, productName: activatedProduct.name });
                }

                // Calcular expiração baseada na string 'expires' do produto
                let expiresAt = null;
                if (activatedProduct.expires) {
                    const expStr = activatedProduct.expires.toLowerCase();
                    if (expStr.includes('vitalício') || expStr.includes('lifetime')) {
                        expiresAt = 'LIFETIME';
                    } else {
                        // Tenta extrair numero de dias (Ex: "30 Dias", "7 Dias")
                        const daysMatch = expStr.match(/(\d+)/);
                        const days = daysMatch ? parseInt(daysMatch[0]) : 30;

                        const d = new Date();
                        d.setDate(d.getDate() + days);
                        expiresAt = d.toISOString();
                    }
                }

                const stmt = db.prepare("INSERT INTO licenses (user_id, product_id, purchase_date, expires_at) VALUES (?, ?, ?, ?)");
                const now = new Date().toISOString();
                stmt.run(userId, activatedProduct.id, now, expiresAt, function (err) {
                    if (err) {
                        console.error("Erro ao salvar licença no DB local:", err);
                        return res.status(500).json({ message: 'Erro ao registrar licença na conta.' });
                    }
                    res.status(200).json({ success: true, productName: activatedProduct.name });
                });
                stmt.finalize();
            });

        } else {
            // Nenhuma validação funcionou
            return res.status(400).json({ message: 'Key inválida, expirada ou não encontrada para os produtos disponíveis.' });
        }
    });
});

// --- ROTA DE UPLOAD DE ARQUIVOS (STREAMING BINARY) ---
// Importante: O frontend deve enviar o arquivo como binary/blob, não como JSON/Base64.
app.post('/upload', async (req, res) => {
    // 1. Validar Headers
    const filename = req.headers['x-filename'];
    const userId = req.headers['x-user-id']; // Frontend deve enviar o ID do user

    if (!filename || !userId) {
        return res.status(400).json({ message: "Headers faltando (x-filename ou x-user-id)" });
    }

    // 2. Buscar limite do usuário no banco (ou usar default 10GB)
    db.get("SELECT upload_limit_gb FROM users WHERE id = ?", [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ message: "Erro ao validar usuário" });
        }

        const limitGB = user.upload_limit_gb || 10;
        const limitBytes = limitGB * 1024 * 1024 * 1024;
        const contentLength = parseInt(req.headers['content-length'] || "0");

        if (contentLength > limitBytes) {
            return res.status(413).json({ message: `Arquivo excede o limite de ${limitGB}GB.` });
        }

        // 3. Preparar Stream de Escrita
        const extension = path.extname(filename) || '.bin';
        const finalFilename = `upload_${Date.now()}_${Math.floor(Math.random() * 10000)}${extension}`;
        const filePath = path.join(uploadsDir, finalFilename);

        const writeStream = fs.createWriteStream(filePath);

        // 4. Pipe: req -> disco (sem carregar tudo na RAM)
        req.pipe(writeStream);

        // Eventos do Stream
        req.on('error', (e) => {
            console.error("Erro no upload (req):", e);
            if (!res.headersSent) res.status(500).json({ message: "Erro na transmissão" });
            writeStream.end();
        });

        writeStream.on('error', (e) => {
            console.error("Erro ao escrever arquivo:", e);
            if (!res.headersSent) res.status(500).json({ message: "Erro ao salvar arquivo" });
        });

        writeStream.on('finish', () => {
            // Sucesso: retorna URL pública
            const publicUrl = `/uploads/${finalFilename}`;
            if (!res.headersSent) {
                res.status(200).json({ url: publicUrl });
            }
        });
    });
});


// --- SOCKET.IO CHAT LOGIC ---

io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    // Enviar histórico de mensagens (últimas 50)
    db.all("SELECT * FROM chat_messages ORDER BY id DESC LIMIT 50", (err, rows) => {
        if (!err && rows) {
            // Reverte para ordem cronológica (antigas primeiro)
            const history = rows.reverse();
            socket.emit('chatHistory', history);
        }
    });

    socket.on('join', (username) => {
        socket.username = username;
        // Opcional: Avisar que entrou
        // io.emit('message', { user: 'System', text: `${username} entrou no chat.` });
    });

    socket.on('chatMessage', (data) => {
        // data deve conter { username, message, timestamp }

        // Salva no banco
        const stmt = db.prepare("INSERT INTO chat_messages (username, message, timestamp, created_at) VALUES (?, ?, ?, ?)");
        const createdAt = new Date().toISOString();
        // Garante que timestamp venha do client ou usa atual
        const displayTime = data.timestamp || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        stmt.run(data.username, data.message, displayTime, createdAt, (err) => {
            if (!err) {
                // Broadcast para todos, incluindo quem enviou, APENAS se salvou ok
                // Ou podemos enviar mesmo antes de confirmar, mas é melhor garantir.
                // Ajustamos o data para incluir ID se necessário, mas por enquanto broadcast igual.
                io.emit('chatMessage', data);
            } else {
                console.error("Erro ao salvar mensagem de chat:", err);
            }
        });
        stmt.finalize();
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
        // if (socket.username) {
        //     io.emit('message', { user: 'System', text: `${socket.username} saiu do chat.` });
        // }
    });
});

// PONTO DE MONTAGEM DO SERVIDOR (SUBSTITUI O ANTERIOR)
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
