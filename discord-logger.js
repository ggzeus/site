const admin = require("firebase-admin");
const CryptoJS = require('crypto-js');

// ========================================
// DISCORD LOGGING SYSTEM - BOT VERSION
// ========================================
// Sistema centralizado para enviar logs formatados ao Discord
// Usa o Bot Manager existente ao invés de webhooks

// --- CONFIGURAÇÃO DOS CANAIS ---
const DISCORD_CHANNELS = {
    // LOGS - Categoria Normal
    'logs-inject': '1467189259193684010',
    'logs-application': '1467189372490219625',
    'logs-chat': '1467189407391023347',
    'logs-ticket': '1467189423304085545',
    'logs-rewardkey': '1467189452349903052',
    'logs-verificacao': '1467189793120194703',
    'logs-apps': '1467222949336711290',
    'logs-login': '1467232394057875640',
    'logs-register': '1467232413972431010',
    'logs-access': '1467232439846961357',

    // LOGS SUSPEITAS
    'applications': '1467189494552985815',
    'inject': '1467189520134045953',

    // LOGS APIS
    'api-called': '1467189852964655289'
};

// Guild ID do servidor Scarlet
const SCARLET_GUILD_ID = '1332186483750211647';

// Encryption key (deve ser a mesma do server.js)
const ENCRYPTION_KEY = process.env.BOT_ENCRYPTION_KEY;

function decryptToken(encryptedToken) {
    const bytes = CryptoJS.AES.decrypt(encryptedToken, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
}

// Helper to get Firestore instance
function getDb() {
    return admin.firestore();
}

// --- CORES DOS EMBEDS ---
const COLORS = {
    SUCCESS: 0x00ff00,    // Verde
    INFO: 0x3498db,       // Azul
    WARNING: 0xf39c12,    // Laranja
    ERROR: 0xe74c3c,      // Vermelho
    SUSPECT: 0x9b59b6,    // Roxo
    DEFAULT: 0x2f3136     // Cinza escuro
};

// --- FUNÇÃO PARA PEGAR BOT TOKEN ---
async function getScarletBotToken() {
    try {
        const db = getDb();
        const botSnapshot = await db.collection('discord_bots').get();

        for (const botDoc of botSnapshot.docs) {
            const botData = botDoc.data();
            const guilds = botData.guilds_with_channels || botData.guilds || [];
            const hasScarletGuild = guilds.some(g => g.id === SCARLET_GUILD_ID);

            if (hasScarletGuild) {
                return decryptToken(botData.bot_token);
            }
        }

        console.warn('[DISCORD-LOG] ⚠️ No bot found with access to Scarlet server');
        return null;
    } catch (error) {
        console.error('[DISCORD-LOG] Error fetching bot token:', error);
        return null;
    }
}

// --- FUNÇÃO PRINCIPAL PARA ENVIAR LOGS ---
/**
 * Envia um log formatado para o Discord via Bot
 * @param {string} category - Categoria do log (ex: 'logs-inject', 'api-called')
 * @param {object} embedData - Dados do embed
 */
async function sendDiscordLog(category, embedData) {
    const channelId = DISCORD_CHANNELS[category];

    if (!channelId) {
        console.warn(`[DISCORD-LOG] ⚠️ Channel not configured for category: ${category}`);
        return { success: false, reason: 'channel_not_configured' };
    }

    try {
        const botToken = await getScarletBotToken();

        if (!botToken) {
            console.log(`[DISCORD-LOG] ${category}: ${embedData.title} (bot not available)`);
            return { success: false, reason: 'bot_not_available' };
        }

        const embed = {
            title: embedData.title || 'Log',
            description: embedData.description || '',
            color: embedData.color || COLORS.INFO,
            fields: embedData.fields || [],
            timestamp: new Date().toISOString(),
            footer: embedData.footer ? { text: embedData.footer } : undefined,
            thumbnail: embedData.thumbnail ? { url: embedData.thumbnail } : undefined
        };

        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ embeds: [embed] })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[DISCORD-LOG] ❌ Error sending to ${category}: ${response.status}`, errorText);
            return { success: false, reason: 'http_error', status: response.status };
        }

        console.log(`[DISCORD-LOG] ✅ Log sent to ${category}`);
        return { success: true };
    } catch (error) {
        console.error(`[DISCORD-LOG] ❌ Error sending to ${category}:`, error.message);
        return { success: false, reason: 'network_error', error: error.message };
    }
}

// ========================================
// FUNÇÕES ESPECÍFICAS POR CATEGORIA
// ========================================

// --- LOGS-INJECT ---
async function logLoaderLogin(data) {
    const { appId, username, hwid, ip, components, success } = data;

    const fields = [];
    if (appId) fields.push({ name: '📱 App ID', value: `\`${appId}\``, inline: true });
    if (username) fields.push({ name: '👤 Usuário/Key', value: `\`${username}\``, inline: true });
    if (hwid) fields.push({ name: '💻 HWID', value: `\`${hwid.substring(0, 16)}...\``, inline: true });
    if (ip) fields.push({ name: '🌐 IP', value: `\`${ip}\``, inline: true });

    if (components) {
        if (components.gpu) fields.push({ name: '🎮 GPU', value: `\`${components.gpu}\``, inline: false });
        if (components.cpu) fields.push({ name: '⚙️ CPU', value: `\`${components.cpu}\``, inline: false });
        if (components.motherboard) fields.push({ name: '🔧 Motherboard', value: `\`${components.motherboard}\``, inline: false });
    }

    return sendDiscordLog('logs-inject', {
        title: success ? '✅ Loader Login Successful' : '❌ Loader Login Failed',
        color: success ? COLORS.SUCCESS : COLORS.ERROR,
        fields
    });
}

// --- LOGS-APPLICATION ---
async function logApplicationAccess(data) {
    const { userId, username, role, ip } = data;

    return sendDiscordLog('logs-application', {
        title: '📂 Aba "Applications" Acessada',
        color: COLORS.INFO,
        fields: [
            { name: '👤 Usuário', value: `\`${username || 'Unknown'}\` (ID: \`${userId}\`)`, inline: true },
            { name: '🎭 Cargo', value: `\`${role || 'user'}\``, inline: true },
            { name: '🌐 IP', value: `\`${ip}\``, inline: true }
        ]
    });
}

// --- LOGS-APPS ---
async function logKeyCreation(data) {
    const { appId, appName, username, count, days, mask } = data;

    return sendDiscordLog('logs-apps', {
        title: '🔑 Keys Criadas',
        color: COLORS.SUCCESS,
        fields: [
            { name: '📱 Aplicação', value: `\`${appName || appId}\``, inline: true },
            { name: '👤 Criador', value: `\`${username}\``, inline: true },
            { name: '🔢 Quantidade', value: `\`${count}\``, inline: true },
            { name: '📅 Duração', value: `\`${days} dias\``, inline: true },
            { name: '🎭 Máscara', value: `\`${mask || 'Padrão'}\``, inline: true }
        ]
    });
}

async function logKeyRedeemed(data) {
    const { appId, appName, key, hwid, username } = data;

    return sendDiscordLog('logs-apps', {
        title: '🎉 Key Resgatada',
        color: COLORS.SUCCESS,
        fields: [
            { name: '📱 Aplicação', value: `\`${appName || appId}\``, inline: true },
            { name: '🔑 Key', value: `\`${key}\``, inline: true },
            { name: '💻 HWID', value: `\`${hwid ? hwid.substring(0, 16) + '...' : 'N/A'}\``, inline: true },
            { name: '👤 Usuário', value: `\`${username || 'Auto-criado'}\``, inline: true }
        ]
    });
}

async function logKeyBlacklisted(data) {
    const { appId, appName, keyId, reason, username } = data;

    return sendDiscordLog('logs-apps', {
        title: '🚫 Key Blacklistada',
        color: COLORS.WARNING,
        fields: [
            { name: '📱 Aplicação', value: `\`${appName || appId}\``, inline: true },
            { name: '🔑 Key ID', value: `\`${keyId}\``, inline: true },
            { name: '👤 Admin', value: `\`${username}\``, inline: true },
            { name: '📝 Motivo', value: `\`${reason || 'Não especificado'}\``, inline: false }
        ]
    });
}

// --- LOGS-VERIFICAÇÃO ---
async function logDiscordLinked(data) {
    const { userId, username, discordId, discordUsername, discordAvatar } = data;

    return sendDiscordLog('logs-verificacao', {
        title: '🔗 Discord Vinculado',
        color: COLORS.SUCCESS,
        thumbnail: discordAvatar,
        fields: [
            { name: '👤 Usuário Site', value: `\`${username}\` (ID: \`${userId}\`)`, inline: true },
            { name: '💬 Discord', value: `\`${discordUsername}\` (ID: \`${discordId}\`)`, inline: true }
        ]
    });
}

// --- LOGS-REWARDKEY ---
async function logLicenseRedeemed(data) {
    const { userId, username, productId, productName, planType, price, txid } = data;

    return sendDiscordLog('logs-rewardkey', {
        title: '🎁 Licença Resgatada',
        color: COLORS.SUCCESS,
        fields: [
            { name: '👤 Usuário', value: `\`${username || userId}\``, inline: true },
            { name: '📦 Produto', value: `\`${productName || productId}\``, inline: true },
            { name: '⏱️ Plano', value: `\`${planType || 'unique'}\``, inline: true },
            { name: '💰 Valor', value: `\`R$ ${price}\``, inline: true },
            { name: '🔖 TXID', value: `\`${txid || 'N/A'}\``, inline: false }
        ]
    });
}

// --- LOGS-CHAT ---
async function logChatMessage(data) {
    const { username, message, timestamp } = data;

    return sendDiscordLog('logs-chat', {
        title: '💬 Mensagem no Chat',
        color: COLORS.INFO,
        fields: [
            { name: '👤 Usuário', value: `\`${username}\``, inline: true },
            { name: '⏰ Horário', value: `\`${timestamp}\``, inline: true },
            { name: '📝 Mensagem', value: message.substring(0, 200), inline: false }
        ]
    });
}

async function logFeedPost(data) {
    const { username, caption, mediaType, featured } = data;

    return sendDiscordLog('logs-chat', {
        title: '📰 Publicação no Feed',
        color: featured ? COLORS.WARNING : COLORS.INFO,
        fields: [
            { name: '👤 Usuário', value: `\`${username}\``, inline: true },
            { name: '🎬 Tipo', value: `\`${mediaType || 'text'}\``, inline: true },
            { name: '⭐ Featured', value: featured ? '✅ Sim' : '❌ Não', inline: true },
            { name: '📝 Legenda', value: caption.substring(0, 200), inline: false }
        ]
    });
}

// ========================================
// LOGS SUSPEITAS
// ========================================

async function logSuspiciousApplicationAccess(data) {
    const { userId, username, role, ip, reason } = data;

    return sendDiscordLog('applications', {
        title: '🚨 ACESSO SUSPEITO - Applications',
        color: COLORS.SUSPECT,
        fields: [
            { name: '⚠️ Motivo', value: `\`${reason}\``, inline: false },
            { name: '👤 Usuário', value: `\`${username || 'Unknown'}\` (ID: \`${userId || 'N/A'}\`)`, inline: true },
            { name: '🎭 Cargo', value: `\`${role || 'none'}\``, inline: true },
            { name: '🌐 IP', value: `\`${ip}\``, inline: true }
        ]
    });
}

async function logSuspiciousInjectAccess(data) {
    const { appId, username, hwid, ip, reason, payload } = data;

    return sendDiscordLog('inject', {
        title: '🚨 ACESSO SUSPEITO - Inject/Loader',
        color: COLORS.ERROR,
        fields: [
            { name: '⚠️ Motivo', value: `\`${reason}\``, inline: false },
            { name: '📱 App ID', value: `\`${appId || 'N/A'}\``, inline: true },
            { name: '👤 Usuário/Key', value: `\`${username || 'Unknown'}\``, inline: true },
            { name: '💻 HWID', value: `\`${hwid || 'N/A'}\``, inline: true },
            { name: '🌐 IP', value: `\`${ip}\``, inline: true },
            { name: '📦 Payload', value: `\`\`\`${payload ? payload.substring(0, 100) : 'N/A'}\`\`\``, inline: false }
        ]
    });
}

// ========================================
// LOGS APIS
// ========================================

async function logApiCall(data) {
    const { method, path, status, ip, userId, duration } = data;

    const color = status >= 500 ? COLORS.ERROR : status >= 400 ? COLORS.WARNING : COLORS.SUCCESS;

    return sendDiscordLog('api-called', {
        title: '🔌 API Call',
        color,
        fields: [
            { name: '🌐 Método', value: `\`${method}\``, inline: true },
            { name: '📍 Path', value: `\`${path}\``, inline: true },
            { name: '📊 Status', value: `\`${status}\``, inline: true },
            { name: '🌐 IP', value: `\`${ip}\``, inline: true },
            { name: '👤 User ID', value: `\`${userId || 'N/A'}\``, inline: true },
            { name: '⏱️ Duração', value: `\`${duration || 0}ms\``, inline: true }
        ]
    });
}

// ========================================
// LOGS DE ACESSO, LOGIN E REGISTER
// ========================================

async function getIPLocation(ip) {
    // Remove ::ffff: prefix if distinct
    let cleanIp = ip.replace('::ffff:', '');
    let isLocal = false;

    // Check if local
    if (cleanIp === '::1' || cleanIp === '127.0.0.1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.')) {
        isLocal = true;
    }

    // --- Helper for fetching with timeout ---
    const fetchWithTimeout = async (url, duration = 3000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), duration);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    };

    // --- TRY 1: ip-api.com (HTTP) ---
    try {
        const apiUrl = isLocal
            ? `http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,query`
            : `http://ip-api.com/json/${cleanIp}?fields=status,country,countryCode,regionName,city,query`;

        const response = await fetchWithTimeout(apiUrl, 3000);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                return {
                    ip: data.query,
                    city: data.city || 'Unknown',
                    region: data.regionName || 'Unknown',
                    country: data.country || 'Unknown',
                    countryCode: data.countryCode || 'UN'
                };
            }
        }
    } catch (err) {
        // Silently fail to try fallback
    }

    // --- TRY 2: ipwho.is (HTTPS - Fallback) ---
    try {
        const apiUrl = isLocal
            ? `https://ipwho.is/`
            : `https://ipwho.is/${cleanIp}`;

        const response = await fetchWithTimeout(apiUrl, 4000);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                return {
                    ip: data.ip,
                    city: data.city || 'Unknown',
                    region: data.region || 'Unknown',
                    country: data.country || 'Unknown',
                    countryCode: data.country_code || 'UN'
                };
            }
        }
    } catch (err) {
        // Log minimal error to avoid console spam
        console.warn(`[IP-LOCATION] Failed to resolve IP ${cleanIp}: ${err.message}`);
    }

    // Default return if everything fails
    return { ip: cleanIp, city: 'Unknown', region: 'Unknown', country: 'Unknown', countryCode: 'UN' };
}

async function logSiteAccess(data) {
    const { ip } = data;
    const location = await getIPLocation(ip);

    return sendDiscordLog('logs-access', {
        title: '🌐 Acesso ao Site',
        color: COLORS.INFO,
        fields: [
            { name: '🌐 IP', value: `\`${location.ip}\``, inline: true },
            { name: '📍 Cidade', value: `\`${location.city}\``, inline: true },
            { name: '🗺️ Região/Estado', value: `\`${location.region}\``, inline: true },
            { name: '🌍 País', value: `\`:flag_${location.countryCode.toLowerCase()}: ${location.country}\``, inline: true }
        ]
    });
}

async function logUserLogin(data) {
    const { username, password, ip, success } = data;
    const location = await getIPLocation(ip);

    return sendDiscordLog('logs-login', {
        title: success ? '✅ Login Bem-Sucedido' : '❌ Login Falhou',
        color: success ? COLORS.SUCCESS : COLORS.ERROR,
        fields: [
            { name: '👤 Usuário', value: `\`${username}\``, inline: true },
            { name: '🔑 Senha', value: `\`${password ? password.substring(0, 3) + '***' : 'N/A'}\``, inline: true },
            { name: '🌐 IP', value: `\`${location.ip}\``, inline: true },
            { name: '📍 Localização', value: `\`${location.city} - ${location.region}\``, inline: true },
            { name: '🌍 País', value: `\`:flag_${location.countryCode.toLowerCase()}: ${location.country}\``, inline: true }
        ]
    });
}

async function logUserRegister(data) {
    const { username, password, email, ip } = data;
    const location = await getIPLocation(ip);

    return sendDiscordLog('logs-register', {
        title: '📝 Novo Registro',
        color: COLORS.SUCCESS,
        fields: [
            { name: '👤 Usuário', value: `\`${username}\``, inline: true },
            { name: '🔑 Senha', value: `\`${password ? password.substring(0, 3) + '***' : 'N/A'}\``, inline: true },
            { name: '📧 Email', value: `\`${email || 'N/A'}\``, inline: true },
            { name: '🌐 IP', value: `\`${location.ip}\``, inline: true },
            { name: '📍 Localização', value: `\`${location.city} - ${location.region}\``, inline: true },
            { name: '🌍 País', value: `\`:flag_${location.countryCode.toLowerCase()}: ${location.country}\``, inline: true }
        ]
    });
}

// ========================================
// UTILITÁRIOS
// ========================================

function detectSQLInjection(input) {
    if (!input) return false;

    const sqlPatterns = [
        /(\bOR\b|\bAND\b).*?=.*?=/i,
        /['"]\s*(OR|AND)\s*['"]\s*=\s*['"]/i,
        /UNION.*?SELECT/i,
        /DROP\s+TABLE/i,
        /INSERT\s+INTO/i,
        /DELETE\s+FROM/i,
        /UPDATE.*?SET/i,
        /--/,
        /\/\*/,
        /xp_/i,
        /exec\s*\(/i
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
    sendDiscordLog,
    logLoaderLogin,
    logApplicationAccess,
    logKeyCreation,
    logKeyRedeemed,
    logKeyBlacklisted,
    logDiscordLinked,
    logLicenseRedeemed,
    logChatMessage,
    logFeedPost,
    logSuspiciousApplicationAccess,
    logSuspiciousInjectAccess,
    logApiCall,
    logSiteAccess,
    logUserLogin,
    logUserRegister,
    detectSQLInjection,
    COLORS,
    DISCORD_CHANNELS
};
