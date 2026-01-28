const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi'); // Importa SDK da Efí

const app = express();

// Garante que a pasta database existe
const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
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

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
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
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

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
                { name: 'Scarlet Menu', type: 'Mod Menu', category: 'software', status: 'Working', update: '27/01/2026', expires: '30 Dias', price: 25.00 },
                { name: 'Scarlet External', type: 'External ESP', category: 'software', status: 'Working', update: '25/01/2026', expires: 'Vitalício', price: 60.00 },
                { name: 'Scarlet Roblox', type: 'Executor', category: 'software', status: 'Working', update: '20/01/2026', expires: '15 Dias', price: 15.00 },
                { name: 'Scarlet Free-Fire', type: 'Mobile Injector', category: 'software', status: 'Working', update: '28/01/2026', expires: '30 Dias', price: 20.00 },
                { name: 'Scarlet Spoofer', type: 'HWID Bypass', category: 'software', status: 'Working', update: '10/01/2026', expires: 'Vitalício', price: 50.00 },
                { name: 'Legit Config V1', type: 'CFG', category: 'addon', status: 'Working', update: '28/01/2026', expires: 'Vitalício', price: 0.00 }
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
    const { name, type, category, status, update, expires, price_daily, price_weekly, price_monthly, price_lifetime, seller_key, role } = req.body;

    console.log("Recebendo request POST /products:", req.body); // DEBUG

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    const stmt = db.prepare(`INSERT INTO products 
        (name, type, category, status, update_date, expires, price_daily, price_weekly, price_monthly, price_lifetime, seller_key) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(name, type, category || 'addon', status, update, expires,
        price_daily || 0, price_weekly || 0, price_monthly || 0, price_lifetime || 0, seller_key || null,
        function (err) {
            if (err) return res.status(500).json({ message: "Erro ao criar produto" });
            res.status(200).json({ message: "Produto criado com sucesso", id: this.lastID });
        });
    stmt.finalize();
});

// Atualizar produto (Admin only)
app.put('/products/:id', (req, res) => {
    const { id } = req.params;
    const { name, type, category, status, expires, price_daily, price_weekly, price_monthly, price_lifetime, seller_key, role } = req.body;

    if (role !== 'admin') {
        return res.status(403).json({ message: "Acesso negado" });
    }

    // Update dos campos editáveis no painel incluindo preços por plano
    const stmt = db.prepare(`UPDATE products SET 
        name = ?, type = ?, category = ?, status = ?, expires = ?, 
        price_daily = ?, price_weekly = ?, price_monthly = ?, price_lifetime = ?, seller_key = ? 
        WHERE id = ?`);
    stmt.run(name, type, category, status, expires,
        price_daily || 0, price_weekly || 0, price_monthly || 0, price_lifetime || 0, seller_key || null,
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
    db.all("SELECT product_id FROM licenses WHERE user_id = ?", [userId], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar licenças" });
        const productIds = rows.map(row => row.product_id);
        res.status(200).json({ licenses: productIds });
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
                        const stmtLicense = db.prepare(`INSERT OR IGNORE INTO licenses 
                            (user_id, product_id, purchase_date) VALUES (?, ?, ?)`);
                        stmtLicense.run(user_id, product_id, new Date().toISOString());
                        stmtLicense.finalize();

                        console.log(`📝 Licença registrada para user_id: ${user_id}, product_id: ${product_id}`);

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

        const stmt = db.prepare("INSERT INTO licenses (user_id, product_id, purchase_date) VALUES (?, ?, ?)");
        const now = new Date().toISOString();
        stmt.run(userId, productId, now, function (err) {
            if (err) return res.status(500).json({ message: "Erro ao processar compra" });
            res.status(200).json({ message: "Compra registrada com sucesso" });
        });
        stmt.finalize();
    });
});

app.listen(3000, () => {
    console.log("Servidor rodando em http://localhost:3000");
});