// Configuração da URL da API
// Se estiver rodando localmente (localhost), usa caminho relativo (ou http://localhost:3000)
// Se estiver em produção (Netlify), DEVE ser a URL do seu backend no Render/Railway
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : 'https://zeus-scarlet.netlify.app'; // PRODUÇÃO: URL do Backend Netlify

let currentMode = 'login';
let currentUser = null;
// productsData agora será preenchido pela API
let productsData = [];
let socket = null;
let currentDocLang = 'javascript'; // Start with JS
let pendingProfilePic = null; // Store profile pic for unified save
let devChatMessages = [{ role: 'system', text: 'Olá! Sou a IA de suporte da Scarlet API. Posso ajudar com exemplos de código ou dúvidas sobre endpoints. Pergunte algo como "Como usar em Python?" ou "Qual a URL de check-user?"' }];


// Verifica auto-login ao iniciar
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('scarlet_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            // Apply saved theme if exists inside user object, else check separate storage
            if (currentUser.theme_config) {
                try {
                    applyTheme(JSON.parse(currentUser.theme_config));
                } catch (e) { console.error("Erro tema", e); }
            }
            loginSuccess(currentUser, true);
        } catch (e) {
            console.error("Erro ao restaurar sessão", e);
        }
    }
});

function applyTheme(config) {
    const root = document.documentElement;
    if (config.primaryColor) {
        root.style.setProperty('--primary-color', config.primaryColor);
        // Simple hover calculation
        root.style.setProperty('--primary-hover', config.primaryColor);
    }
    if (config.darkMode !== undefined) {
        if (config.darkMode) {
            root.style.setProperty('--bg-color', '#0f0f0f');
            root.style.setProperty('--card-bg', '#1a1a1a');
            root.style.setProperty('--text-color', '#ffffff');
            root.style.setProperty('--text-muted', '#aaaaaa');
            root.style.setProperty('--border-color', '#333333');
            root.style.setProperty('--modal-bg', 'rgba(0, 0, 0, 0.9)');
        } else {
            root.style.setProperty('--bg-color', '#f4f4f4');
            root.style.setProperty('--card-bg', '#ffffff');
            root.style.setProperty('--text-color', '#333333');
            root.style.setProperty('--text-muted', '#666666');
            root.style.setProperty('--border-color', '#dddddd');
            root.style.setProperty('--modal-bg', 'rgba(255, 255, 255, 0.9)');
        }
    }
}

function showModal(mode) {
    currentMode = mode;
    const modal = document.getElementById('authModal');
    const title = document.getElementById('modalTitle');
    const btn = document.getElementById('submitBtn');
    const msg = document.getElementById('msg');
    const emailGroup = document.getElementById('emailGroup');
    const emailInput = document.getElementById('email');

    msg.innerText = '';
    modal.style.display = 'flex';

    if (mode === 'login') {
        title.innerText = 'Acessar Scarlet';
        btn.innerText = 'ENTRAR';
        emailGroup.style.display = 'none';
        document.getElementById('roleGroup').style.display = 'none';
        emailInput.required = false;
    } else {
        title.innerText = 'Junte-se ao Scarlet';
        btn.innerText = 'REGISTRAR';
        emailGroup.style.display = 'block';
        document.getElementById('roleGroup').style.display = 'flex';
        emailInput.required = true;
    }
}

function closeModal() {
    document.getElementById('authModal').style.display = 'none';
}

function showNotify(type, message) {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `notification - toast ${type} `;

    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-triangle';

    toast.innerHTML = `
    < i class="fa-solid ${icon}" ></i >
        <div class="msg-content">
            <strong>${type.toUpperCase()}</strong>
            <p>${message}</p>
        </div>
`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const email = document.getElementById('email').value;

    const endpoint = currentMode === 'login' ? `${API_BASE_URL} /login` : `${API_BASE_URL}/register`;
    const msg = document.getElementById('msg');

    let payload = { user, pass };
    if (currentMode === 'register') {
        const role = document.querySelector('input[name="role"]:checked').value;
        payload = { user, pass, email, role };
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            if (currentMode === 'login') {
                currentUser = {
                    id: data.userId,
                    username: data.username,
                    email: data.email,
                    role: data.role,
                    is_developer: data.is_developer,
                    dev_token: data.dev_token
                };
                loginSuccess(currentUser);
            } else {
                // Auto-login after register
                if (data.user) {
                    currentUser = data.user;
                    loginSuccess(currentUser);
                    msg.style.color = '#00ff00';
                    msg.innerText = 'Conta criada! Entrando...';
                } else {
                    // Fallback old behavior
                    msg.style.color = '#00ff00';
                    msg.innerText = 'Conta criada! Faça login.';
                    setTimeout(() => showModal('login'), 1500);
                }
            }
        } else {
            msg.style.color = 'red';
            msg.innerText = data.message;
        }
    } catch (error) {
        console.error(error);
        msg.innerText = "Erro de conexão";
    }
});

function updateUserProfileUI(user) {
    if (!user) return;

    // Update Username
    const welcomeEl = document.getElementById('welcomeUser');
    if (welcomeEl) welcomeEl.innerText = user.username;

    // Update Role
    const roleEl = document.getElementById('userRole');
    if (roleEl) {
        let roleInfo = { text: 'Client', className: 'client' };

        if (user.username.toLowerCase() === 'zeus') {
            roleInfo = { text: 'Founder', className: 'founder' };
        } else if (user.is_developer) {
            roleInfo = { text: 'Dev', className: 'dev' };
        } else if (user.is_content_creator) {
            roleInfo = { text: 'Influencer', className: 'influencer' };
        }

        roleEl.innerText = roleInfo.text;
        roleEl.className = 'user-role ' + roleInfo.className;
    }

    // Update Profile Pic
    const picEl = document.getElementById('userProfilePic');
    if (picEl) {
        // Priority: Discord Avatar (if enabled) > Default Profile Pic
        let avatarUrl = user.profile_pic || 'https://cdn.discordapp.com/embed/avatars/0.png';

        if (user.use_discord_avatar && user.discord_avatar) {
            avatarUrl = user.discord_avatar;
        }

        picEl.src = avatarUrl;
        picEl.onerror = () => { picEl.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; };
    }
}

async function loginSuccess(userData, isAutoLogin = false) {
    if (!isAutoLogin) {
        localStorage.setItem('scarlet_user', JSON.stringify(userData));
    }
    // Always force close modals to prevent "dark screen" issues
    closeModal();
    const payModal = document.getElementById('paymentModal');
    if (payModal) payModal.style.display = 'none';

    // Sanitize Profile Pic if it's the broken placeholder
    // Logic for Discord Avatar priority
    if (userData.use_discord_avatar && userData.discord_avatar) {
        userData.profile_pic = userData.discord_avatar;
    } else if (userData.profile_pic === 'https://i.imgur.com/user_placeholder.png') {
        userData.profile_pic = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
    localStorage.setItem('scarlet_user', JSON.stringify(userData));

    document.getElementById('homeSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';

    document.getElementById('authButtons').style.display = 'none';
    const userMenu = document.getElementById('userMenu');
    userMenu.style.display = 'flex';

    updateUserProfileUI(userData);

    // Lógica ADMIN
    // Fallback para sessão antiga: Se for 'zeus' e não tiver role definida, assume admin
    if (userData.username === 'zeus' && !userData.role) {
        userData.role = 'admin';
        localStorage.setItem('scarlet_user', JSON.stringify(userData));
    }

    const adminTab = document.getElementById('adminTab');
    const adminTicketsTab = document.getElementById('adminTicketsTab');
    const partnerAppsTab = document.getElementById('partnerAppsTab');

    // Partner Specific Tabs
    const partnerPlansTab = document.getElementById('partnerPlansTab');
    const partnerManageTab = document.getElementById('partnerManageTab');

    // Client Tabs (to hide for partners)
    // Intro/Community/Addons/Install/Config are client tabs (Intro and Config maybe common?)
    // Requirement: "Caso for cliente, só irá aparecer para ele: Introdução; Community; Conteúdos Adicionais; Instalação; Configuração;"
    // Requirement: "Caso for Partner: Planos (NOVA TAB); Gerenciar (NOVA TAB)"

    const allSidebarLi = document.querySelectorAll('.sidebar li');

    // Force Hide All First
    allSidebarLi.forEach(li => li.style.display = 'none');

    if (userData.role === 'partner') {
        // Show Partner Tabs
        if (partnerPlansTab) partnerPlansTab.style.display = 'block';
        if (partnerManageTab) partnerManageTab.style.display = 'block';
        // Maybe Config for partner too? Requirement didn't say explicit NO, but said "Caso for Partner: Planos, Gerenciar". 
        // Strict interpretation: ONLY Planos and Gestionar. But usually they need config/logout. keeping strict for now based on prompt.

        loadDashContent('partner_plans'); // Default for partner
    } else {
        // Default Client
        // Show Client Tabs (Intro, Promo, Addons, Install, Config)
        // Indices: 0(Intro), 1(Homo?), 2(Promo), etc. safer to query by onclick attribute or text, but let's assume standard ones are visible by default
        // The Li elements don't have IDs except the special ones. 
        // Strategy: Reset all standard ones to display block (except special ones)

        // Re-enable standard tabs:
        const standardTabs = ['intro', 'promo', 'addons', 'install', 'config'];
        document.querySelectorAll('.sidebar li').forEach(li => {
            const onclick = li.getAttribute('onclick');
            if (onclick && standardTabs.some(t => onclick.includes(`'${t}'`))) {
                li.style.display = 'block';
            }
        });

        loadDashContent('intro'); // Default for client
    }

    // Admin Overrides (Additive)
    if (userData.role === 'admin') {
        if (adminTab) adminTab.style.display = 'block';
        if (adminTicketsTab) adminTicketsTab.style.display = 'block';
        if (partnerAppsTab) partnerAppsTab.style.display = 'block';
        // Admin likely sees everything or specific admin view. 
        // Prompt didn't specify Admin view changes, so we assume Admin sees Admin Tabs + maybe Client tabs?
        // Let's keep Admin seeing Client stuff + Admin stuff for debug.
    }

    const devTab = document.getElementById('developerTab');
    if (userData.is_developer) {
        devTab.style.display = 'block';
    } else {
        devTab.style.display = 'none';
    }

    // Carrega produtos da API antes de inicializar a tela
    await fetchProducts();

    // Sincroniza dados mais recentes do usuário (Profile Pic, Theme, etc)
    // Isso garante que se mudou em outro PC, aqui atualiza.
    if (userData.id) {
        await syncUserSettings(userData.id);
        // Atualiza userData local com o que veio do sync (já salvo no localStorage e currentUser)
        userData = currentUser;
        updateUserProfileUI(userData);
    }

    // Sincronizar Licenças
    await syncLicenses(userData.id);

    // loadDashContent call moved inside logic above to handle different default pages
}

async function fetchProducts() {
    try {
        const res = await fetch(`${API_BASE_URL}/products`);
        const data = await res.json();
        if (data.products && data.products.length > 0) {
            productsData = data.products;
        } else {
            // Se API retornar vazio, podemos manter vazio ou usar placeholders
            console.log("Nenhum produto cadastrado na API.");
        }
    } catch (e) {
        console.error("Erro ao buscar produtos", e);
    }
}

async function syncLicenses(userId) {
    try {
        const response = await fetch(`${API_BASE_URL}/licenses/${userId}`);
        const data = await response.json();

        // Reseta dados de licença
        productsData.forEach(p => {
            p.hasLicense = false;
            p.licenseExpiresAt = null;
        });

        if (data.details) {
            // Nova lógica com expiração
            data.details.forEach(license => {
                const prod = productsData.find(p => p.id === license.product_id);
                if (prod) {
                    prod.hasLicense = true;
                    prod.licenseExpiresAt = license.expires_at;
                }
            });
        } else if (data.licenses) {
            // Fallback legado
            productsData.forEach(prod => {
                if (data.licenses.includes(prod.id)) {
                    prod.hasLicense = true;
                }
            });
        }
    } catch (e) {
        console.error("Erro ao sincronizar licenças", e);
    }
}

async function syncUserSettings(userId) {
    try {
        const res = await fetch(`${API_BASE_URL}/user/settings/${userId}`);
        const data = await res.json();

        if (res.ok) {
            let changed = false;
            // Atualiza Profile Pic
            if (data.profile_pic) {
                currentUser.profile_pic = data.profile_pic;
                changed = true;
            }
            // Atualiza Tema
            if (data.theme_config) {
                currentUser.theme_config = data.theme_config;
                // Aplica tema imediatamente
                try {
                    applyTheme(JSON.parse(data.theme_config));
                } catch (e) { console.error("Erro ao aplicar tema sync", e); }
                changed = true;
            }
            // Atualiza dados do Discord
            if (data.discord_id !== undefined) {
                currentUser.discord_id = data.discord_id;
                currentUser.discord_username = data.discord_username;
                currentUser.discord_email = data.discord_email;
                currentUser.discord_avatar = data.discord_avatar;
                currentUser.use_discord_avatar = data.use_discord_avatar;
                changed = true;
            }

            if (changed) {
                localStorage.setItem('scarlet_user', JSON.stringify(currentUser));
                console.log("Dados do usuário sincronizados com o servidor.");
                // Refresh settings UI if it's open
                if (typeof currentDashTab !== 'undefined' && currentDashTab === 'settings') {
                    renderSettingsContent();
                }
                // Update profile picture if using Discord avatar
                updateUserProfileUI(currentUser);
            }
        }
    } catch (e) {
        console.error("Erro ao sincronizar user settings", e);
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('scarlet_user'); // Limpa também o storage
    location.reload();
}

async function loadDashContent(section) {
    const container = document.getElementById('dashDynamicContent');

    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active-tab'));

    // Tenta encontrar o elemento clicado, se não, acha pelo ID ou class (para chamadas manuais pode ser null event)
    if (event && event.currentTarget && event.currentTarget.tagName === 'LI') {
        event.currentTarget.classList.add('active-tab');
    }

    switch (section) {
        case 'intro':
            container.innerHTML = `
                <h2>Bem-vindo ao Scarlet</h2>
                <p>Selecione uma opção no menu para gerenciar seus produtos.</p>
                <div class="status-box">
                    <h3>Status do Sistema</h3>
                    <p class="status-active" style="color: #00ff88;"><i class="fa-solid fa-check-circle"></i> Todos os sistemas operacionais.</p>
                </div>
            `;
            break;

        case 'promo':
            container.innerHTML = `
                <h2><i class="fa-solid fa-users"></i> Community</h2>
                <div class="community-subtabs">
                    <button class="subtab-btn active" id="tab-feed" onclick="switchCommunityTab('feed')">Scarlet Feed</button>
                    <button class="subtab-btn" id="tab-chat" onclick="switchCommunityTab('chat')">Chat Global</button>
                </div>

                <div id="feedContainer" class="feed-container">
                    <p style="color: #888; margin-bottom: 20px;">Compartilhe momentos, vídeos e fotos com a comunidade!</p>
                </div>
                <div id="chatContainer" class="chat-container">
                    <div id="chatMessages" class="chat-messages">
                        <!-- Mensagens aparecerão aqui -->
                        <div class="message message-system">Bem-vindo ao Chat Global!</div>
                    </div>
                    <form id="chatForm" class="chat-input-area" onsubmit="sendChatMessage(event)">
                        <input type="text" id="chatInput" placeholder="Digite sua mensagem..." autocomplete="off">
                        <button type="submit"><i class="fa-solid fa-paper-plane"></i></button>
                    </form>
                </div>
            `;
            await renderFeed(document.getElementById('feedContainer'));
            // Inicializa o chat se a aba estiver ativa (ou quando o usuário mudar)
            // Mas por padrão começa no feed.
            break;

        case 'addons':
            const addonContainer = document.getElementById('dashDynamicContent');
            addonContainer.innerHTML = `
                <h2>Conteúdos Adicionais</h2>
                <p>Configurações legítimas (CFGs), Scripts Lua e Temas visuais.</p>
                <div style="margin-top:20px;">
                </div>
            `;
            await fetchProducts(); // Garante dados mais recentes
            renderAddons(addonContainer);
            break;

        case 'install':
            // Recarrega produtos frescos caso tenha sido atualizado por admin
            await fetchProducts();
            await syncLicenses(currentUser.id);
            renderProducts(container);
            break;

        case 'config':
            renderSettings(container);
            break;

        case 'partner_plans':
            container.innerHTML = `
                <h2><i class="fa-solid fa-clipboard-list"></i> Planos de Parceria</h2>
                <p>Aqui você pode visualizar seus planos e benefícios de parceiro.</p>
                <div class="status-box">
                    <h3>Status da Parceria</h3>
                    <p>Parceria Ativa (Nível 1)</p>
                </div>
            `;
            break;

        case 'partner_manage':
            container.innerHTML = `
                <h2><i class="fa-solid fa-list-check"></i> Gerenciar Parceria</h2>
                <p>Ferramentas de gerenciamento para parceiros.</p>
                <div style="margin-top: 20px;">
                    <button class="cta-button">Gerar Link de Indicação</button>
                    <button class="btn-outline">Ver Estatísticas</button>
                </div>
            `;
            break;

        case 'applications':
            if (currentUser.role !== 'partner' && currentUser.role !== 'admin') {
                container.innerHTML = "<h2>Acesso Negado</h2>";
                return;
            }
            loadPartnerApps();
            break;

        case 'admin':
            if (currentUser.role !== 'admin') {
                container.innerHTML = "<h2>Acesso Negado</h2>";
                return;
            }
            renderAdminPanel(container);
            break;

        case 'docs':
            if (!currentUser.is_developer) {
                container.innerHTML = "<h2>Acesso Negado</h2>";
                return;
            }
            renderDevDocs(container);
            break;

        case 'admin_tickets':
            if (currentUser.role !== 'admin') {
                container.innerHTML = "<h2>Acesso Negado</h2>";
                return;
            }
            renderAdminTickets(container);
            break;

        case 'bot_manager':
            if (currentUser.role !== 'admin') {
                container.innerHTML = "<h2>Acesso Negado</h2>";
                return;
            }
            await renderBotManager();
            break;
    }
}

// --- ADMIN PANEL ---
// --- ADMIN PANEL ---
let isEditing = false;
let editingId = null;

function renderAdminPanel(container) {
    container.innerHTML = `
        <h2><i class="fa-solid fa-user-secret"></i> Painel Zeus - Gestão de Produtos</h2>
        
        <div class="status-box" style="border-left-color: #ff4444;">
            <h3 id="formTitle">Criar Novo Conteúdo</h3>
            <form id="createProductForm" onsubmit="handleProductSubmit(event)">
                <div class="input-group">
                    <label>Nome do Produto</label>
                    <input type="text" id="prodName" required placeholder="Ex: Scarlet GodMode">
                </div>
                <div class="input-group">
                    <label>Tipo</label>
                    <input type="text" id="prodType" placeholder="Ex: Lua Script / Config">
                </div>
                <div class="input-group">
                    <label>URL da Imagem (Opcional)</label>
                    <input type="text" id="prodImageUrl" placeholder="Ex: https://i.imgur.com/...">
                </div>
                
                <!-- Preços por Plano -->
                <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <h4 style="color: var(--primary-color); margin-bottom: 10px;">💰 Preços por Plano</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div class="input-group">
                            <label>Diário (R$)</label>
                            <input type="number" step="0.01" id="prodPriceDaily" placeholder="0.00">
                        </div>
                        <div class="input-group">
                            <label>Semanal (R$)</label>
                            <input type="number" step="0.01" id="prodPriceWeekly" placeholder="0.00">
                        </div>
                        <div class="input-group">
                            <label>Mensal (R$)</label>
                            <input type="number" step="0.01" id="prodPriceMonthly" placeholder="0.00">
                        </div>
                        <div class="input-group">
                            <label>Lifetime (R$)</label>
                            <input type="number" step="0.01" id="prodPriceLifetime" placeholder="0.00">
                        </div>
                    </div>
                </div>

                <div class="input-group">
                    <label>Validade (Texto Descritivo)</label>
                    <input type="text" id="prodExpires" placeholder="Ex: Vários planos disponíveis">
                </div>
                <div class="input-group">
                    <label>Categoria</label>
                    <select id="prodCategory" style="width:100%; padding: 10px; background: #222; color: #fff; border: 1px solid #444; border-radius: 5px;">
                        <option value="addon">Conteúdo Adicional</option>
                        <option value="software">Instalação (Produto Principal)</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>Status</label>
                    <select id="prodStatus" style="width:100%; padding: 10px; background: #222; color: #fff; border: 1px solid #444; border-radius: 5px;">
                        <option value="Working">Working</option>
                        <option value="Updating">Updating</option>
                        <option value="Detected">Detected</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>🔑 KeyAuth Seller Key (Opcional)</label>
                    <input type="text" id="prodSellerKey" placeholder="Deixe vazio para usar a key global">
                </div>
                <button type="submit" id="submitProdBtn" class="cta-button" style="background: #ff4444; width: 100%; margin-top: 15px;">PUBLICAR PRODUTO</button>
                <button type="button" id="cancelEditBtn" onclick="cancelEdit()" style="display:none; background: #555; width: 100%; margin-top: 10px; border:none; padding:10px; color:white; cursor:pointer;">CANCELAR EDIÇÃO</button>
            </form>
            <p id="adminMsg" style="margin-top:10px; text-align:center;"></p>
        </div>

        <div class="status-box" style="border-left-color: #5865F2; margin-top:20px;">
             <h3><i class="fa-brands fa-discord"></i> Enviar Atualização (Discord / Feed)</h3>
             <form onsubmit="handleSendUpdate(event)">
                <div class="input-group">
                    <label>Selecione o Produto</label>
                    <select id="updateProdSelect" style="width:100%; padding:10px; background:#222; color:#fff; border:1px solid #444; border-radius:5px;">
                        ${productsData.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                    </select>
                </div>
                <div class="input-group">
                    <label>Mensagem de Atualização (Use markdown: **negrito**)</label>
                    <textarea id="updateMessage" rows="3" placeholder="Ex: **Versão 2.0** lançada! Correções de bugs..." style="width:100%; padding:10px; background:#222; color:#fff; border:1px solid #444; border-radius:5px;"></textarea>
                </div>
                <button type="submit" class="cta-button" style="width:100%; background:#5865F2;">ENVIAR UPDATE</button>
             </form>
        </div>


        <h3 style="margin-top:30px;">Produtos Ativos</h3>
        <div class="products-grid">
            ${productsData.map(p => `
                <div class="product-card" style="min-height: 100px; position: relative;">
                    <h4 style="color:var(--primary-color)">${p.name}</h4>
                    <p style="font-size:0.8rem">${p.type}</p>
                    <p style="font-size:0.75rem; color:#888;">
                        ${p.price_daily > 0 ? `Diário: R$ ${p.price_daily.toFixed(2)}<br>` : ''}
                        ${p.price_weekly > 0 ? `Semanal: R$ ${p.price_weekly.toFixed(2)}<br>` : ''}
                        ${p.price_monthly > 0 ? `Mensal: R$ ${p.price_monthly.toFixed(2)}<br>` : ''}
                        ${p.price_lifetime > 0 ? `Lifetime: R$ ${p.price_lifetime.toFixed(2)}` : ''}
                    </p>
                    <div style="display: flex; gap: 5px; margin-top: 10px;">
                        <button class="btn-outline" style="flex: 1; font-size:0.8rem; padding:5px 10px;" onclick="startEdit(${p.id})"><i class="fa-solid fa-pen"></i> Editar</button>
                        <button class="btn-outline" style="flex: 1; font-size:0.8rem; padding:5px 10px; background: #ff4444; border-color: #ff4444;" onclick="deleteProduct(${p.id})"><i class="fa-solid fa-trash"></i> Excluir</button>
                    </div>
                </div>
            `).join('')}
        </div>

        <!-- AREA DE REVENDEDORES -->
        <div style="margin-top: 50px; border-top: 2px solid #333; padding-top: 20px;">
            <h2><i class="fa-solid fa-users-gear"></i> Gerenciar Revendedores</h2>
             <div class="status-box" style="border-left-color: #00bd9d;">
                <h3>Adicionar Novo Revendedor</h3>
                <form onsubmit="handleResellerSubmit(event)">
                    <div class="input-group">
                        <label>Nome do Revendedor</label>
                        <input type="text" id="resName" required placeholder="Ex: Scarlet Shop">
                    </div>
                    <div class="input-group">
                        <label>Link (exibido e redirecionado)</label>
                        <input type="text" id="resLink" required placeholder="discord.gg/scarletmenu">
                    </div>
                     <div class="input-group">
                        <label>Logo (Arquivo ou Ctrl+V na página)</label>
                        <input type="file" id="resLogo" accept="image/*" style="padding: 10px; background: #222; width: 100%;">
                        <div id="pasteArea" style="border: 2px dashed #444; padding: 20px; text-align: center; margin-top: 10px; color: #888; cursor: pointer;">
                            <span id="pasteStatus">Clique aqui e pressione Ctrl+V para colar logo</span>
                        </div>
                        <input type="hidden" id="resLogoBase64">
                    </div>
                     <div class="input-group">
                        <label>Método de Contato (Opcional)</label>
                        <input type="text" id="resContact" placeholder="Ex: Via Discord">
                    </div>
                    <button type="submit" class="cta-button" style="width:100%; margin-top:10px;">ADICIONAR REVENDEDOR</button>
                    <!-- Script para colar imagem -->
                    <script>
                        document.addEventListener('paste', function(e) {
                             const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                             for (let index in items) {
                                 const item = items[index];
                                 if (item.kind === 'file' && item.type.includes('image/')) {
                                     const blob = item.getAsFile();
                                     const reader = new FileReader();
                                     reader.onload = function(event){
                                         document.getElementById('resLogoBase64').value = event.target.result;
                                         document.getElementById('pasteStatus').innerText = "Imagem colada com sucesso!";
                                         document.getElementById('pasteStatus').style.color = "#00ff00";
                                     };
                                     reader.readAsDataURL(blob);
                                 }
                             }
                        });
                        document.getElementById('resLogo').addEventListener('change', function() {
                            const file = this.files[0];
                            if(file){
                                const reader = new FileReader();
                                reader.onload = function(e) {
                                    document.getElementById('resLogoBase64').value = e.target.result;
                                     document.getElementById('pasteStatus').innerText = "Imagem selecionada!";
                                }
                                reader.readAsDataURL(file);
                            }
                        });
                    </script>
                </form>
            </div>

            <h3 style="margin-top:20px;">Revendedores Ativos</h3>
            <div class="resellers-grid" id="adminResellersList">
                <p>Carregando...</p>
            </div>
        </div>

        <!-- AREA DE CRIADORES DE CONTEÚDO -->
        <div style="margin-top: 50px; border-top: 2px solid #333; padding-top: 20px;">
            <h2><i class="fa-solid fa-star"></i> Gerenciar Criadores de Conteúdo</h2>
            <p style="color:#888; margin-bottom:20px;">Defina quais usuários podem postar vídeos e aparecer em destaque no feed.</p>
            
            <div class="status-box" style="border-left-color: #00ff88;">
                <h3>Usuários Cadastrados</h3>
                <div id="contentCreatorsList" style="max-height: 450px; overflow-y: auto;">
                    <p>Carregando...</p>
                </div>
            </div>
        </div>
    `;

    // Carrega a lista no painel admin
    loadAdminResellers_Render();
    loadContentCreators();
}

async function loadContentCreators() {
    try {
        const res = await fetch(`${API_BASE_URL}/users/list?role=${currentUser.role}`);
        const data = await res.json();

        const list = document.getElementById('contentCreatorsList');
        if (!list) return;

        if (data.users && data.users.length > 0) {
            list.innerHTML = data.users.map(user => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:rgba(255,255,255,0.03); margin-bottom:10px; border-radius:8px; flex-wrap: wrap; gap: 10px;">
                    <div style="flex: 1; min-width: 200px;">
                        <strong style="color:white;">${user.username}</strong>
                        <br>
                        <small style="color:#888;">${user.email}</small>
                    </div>
                    
                    <div style="display:flex; align-items:center; gap:15px;">
                        <!-- Limit Input -->
                        <div style="display:flex; align-items:center; gap:5px;">
                            <label style="color:#888; font-size:0.8rem;">Limite (GB):</label>
                            <input type="number" 
                                   value="${user.upload_limit_gb || 10}" 
                                   onchange="updateUserLimit(${user.id}, this.value)"
                                   style="width:60px; padding:5px; background:#222; border:1px solid #444; color:white; border-radius:4px; text-align:center;">
                        </div>

                        <!-- Creator Toggle -->
                        <div style="display:flex; flex-direction:column; gap:5px;">
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                                <input type="checkbox" 
                                    ${user.is_content_creator ? 'checked' : ''} 
                                    onchange="toggleContentCreator(${user.id}, this.checked)"
                                    style="width:20px; height:20px; cursor:pointer;">
                                <span style="color:${user.is_content_creator ? '#00ff88' : '#888'}; font-weight:600;">
                                    Creator
                                </span>
                            </label>
                            
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                                <input type="checkbox" 
                                    ${user.is_developer ? 'checked' : ''} 
                                    onchange="toggleDeveloper(${user.id}, this.checked)"
                                    style="width:20px; height:20px; cursor:pointer;">
                                <span style="color:${user.is_developer ? '#ff1e1e' : '#888'}; font-weight:600;">
                                    Developer
                                </span>
                            </label>
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<p>Nenhum usuário cadastrado.</p>';
        }
    } catch (e) {
        console.error("Erro ao carregar usuários:", e);
    }
}

async function updateUserLimit(userId, limit) {
    try {
        const res = await fetch(`/users/${userId}/limit`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                role: currentUser.role,
                limitGB: parseFloat(limit)
            })
        });

        if (res.ok) {
            // Feedback visual sutil (opcional)
            console.log("Limite atualizado");
        } else {
            showNotify('error', "Erro ao atualizar limite");
        }
    } catch (e) {
        console.error("Erro ao atualizar limite:", e);
    }
}

async function toggleContentCreator(userId, isCreator) {
    try {
        const res = await fetch(`/users/${userId}/creator`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                role: currentUser.role,
                isContentCreator: isCreator
            })
        });

        if (res.ok) {
            // Recarrega a lista
            await loadContentCreators();

            // Se for o próprio usuário, atualiza a sessão
            if (userId === currentUser.id) {
                currentUser.is_content_creator = isCreator ? 1 : 0;
                localStorage.setItem('scarlet_user', JSON.stringify(currentUser));
                updateUserProfileUI(currentUser);
            }
        } else {
            showNotify('error', 'Erro ao atualizar status');
            await loadContentCreators(); // Reverte UI
        }
    } catch (e) {
        console.error("Erro ao atualizar content creator:", e);
        showNotify('error', 'Erro de conexão');
        await loadContentCreators(); // Reverte UI
    }
}

async function toggleDeveloper(userId, isDeveloper) {
    try {
        const res = await fetch(`/users/${userId}/developer`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                role: currentUser.role,
                isDeveloper: isDeveloper
            })
        });

        if (res.ok) {
            const data = await res.json();
            console.log("Developer status updated", data);

            // Recarrega a lista
            await loadContentCreators();

            // Se for o próprio usuário, atualiza a sessão
            if (userId === currentUser.id) {
                currentUser.is_developer = isDeveloper ? 1 : 0;
                currentUser.dev_token = data.dev_token || currentUser.dev_token;
                localStorage.setItem('scarlet_user', JSON.stringify(currentUser));
                updateUserProfileUI(currentUser);

                // Refresh na UI dos tabs
                const devTab = document.getElementById('developerTab');
                if (currentUser.is_developer) {
                    devTab.style.display = 'block';
                } else {
                    devTab.style.display = 'none';
                }
            }
        } else {
            showNotify('error', 'Erro ao atualizar status de desenvolvedor');
            await loadContentCreators(); // Reverte
        }
    } catch (e) {
        console.error("Erro ao atualizar desenvolvedor:", e);
        showNotify('error', 'Erro de conexão');
        await loadContentCreators(); // Reverte
    }
}

async function loadAdminResellers_Render() {
    await fetchResellers();
    const list = document.getElementById('adminResellersList');
    if (!list) return;

    if (resellersData.length === 0) {
        list.innerHTML = '<p>Nenhum revendedor.</p>';
        return;
    }

    list.innerHTML = resellersData.map(r => `
        <div class="product-card" style="min-height:auto; display:flex; justify-content:space-between; align-items:center; flex-direction:row; padding:15px;">
            <div>
                <h4 style="color:white; margin:0;">${r.name}</h4>
                <a href="${r.link}" target="_blank" style="color:var(--primary-color); font-size:0.8rem;">${r.link}</a>
            </div>
            <button onclick="deleteReseller(${r.id})" class="btn-outline" style="background:#ff4444; border:none; color:white;"><i class="fa-solid fa-trash"></i></button>
        </div>
    `).join('');
}

async function handleResellerSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('resName').value;
    const link = document.getElementById('resLink').value;
    const contact_method = document.getElementById('resContact').value;
    let logo_url = document.getElementById('resLogoBase64').value; // Get Base64

    // Se não tiver logo enviada, envia string vazia para usar o ícone padrão no front
    if (!logo_url) {
        logo_url = '';
    }

    try {
        const res = await fetch('/resellers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: currentUser.role, name, link, contact_method, logo_url })
        });
        if (res.ok) {
            showNotify('success', 'Revendedor adicionado!');
            document.getElementById('resName').value = '';
            document.getElementById('resLink').value = '';
            document.getElementById('resContact').value = '';
            document.getElementById('resLogoBase64').value = '';
            document.getElementById('resLogo').value = '';
            document.getElementById('pasteStatus').innerText = "Clique aqui e pressione Ctrl+V para colar logo";
            document.getElementById('pasteStatus').style.color = "#888";
            loadAdminResellers_Render();
        } else {
            showNotify('error', 'Erro ao adicionar.');
        }
    } catch (e) {
        console.error(e);
    }
}

async function deleteReseller(id) {
    if (!confirm('Remover revendedor?')) return;
    try {
        const res = await fetch(`/resellers/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: currentUser.role })
        });
        if (res.ok) {
            loadAdminResellers_Render();
        }
    } catch (e) {
        console.error(e);
    }
}


function startEdit(id) {
    const product = productsData.find(p => p.id === id);
    if (!product) return;

    isEditing = true;
    editingId = id;

    document.getElementById('formTitle').innerText = `Editar: ${product.name}`;
    document.getElementById('prodName').value = product.name;
    document.getElementById('prodType').value = product.type;
    document.getElementById('prodImageUrl').value = product.image_url || '';
    document.getElementById('prodCategory').value = product.category || 'addon';
    document.getElementById('prodPriceDaily').value = product.price_daily || 0;
    document.getElementById('prodPriceWeekly').value = product.price_weekly || 0;
    document.getElementById('prodPriceMonthly').value = product.price_monthly || 0;
    document.getElementById('prodPriceLifetime').value = product.price_lifetime || 0;
    document.getElementById('prodExpires').value = product.expires;
    document.getElementById('prodStatus').value = product.status;
    document.getElementById('prodSellerKey').value = product.seller_key || '';

    document.getElementById('submitProdBtn').innerText = "SALVAR ALTERAÇÕES";
    document.getElementById('cancelEditBtn').style.display = 'block';

    // Scroll to form
    document.querySelector('.status-box').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    isEditing = false;
    editingId = null;
    document.getElementById('createProductForm').reset();
    document.getElementById('formTitle').innerText = "Criar Novo Conteúdo";
    document.getElementById('submitProdBtn').innerText = "PUBLICAR PRODUTO";
    document.getElementById('cancelEditBtn').style.display = 'none';
}

async function handleProductSubmit(e) {
    e.preventDefault();
    if (isEditing) {
        await updateProduct();
    } else {
        await createProduct();
    }
}

async function createProduct() {
    const name = document.getElementById('prodName').value;
    const type = document.getElementById('prodType').value;
    const image_url = document.getElementById('prodImageUrl').value;
    const category = document.getElementById('prodCategory').value;
    const price_daily = parseFloat(document.getElementById('prodPriceDaily').value) || 0;
    const price_weekly = parseFloat(document.getElementById('prodPriceWeekly').value) || 0;
    const price_monthly = parseFloat(document.getElementById('prodPriceMonthly').value) || 0;
    const price_lifetime = parseFloat(document.getElementById('prodPriceLifetime').value) || 0;
    const expires = document.getElementById('prodExpires').value;
    const status = document.getElementById('prodStatus').value;
    const seller_key = document.getElementById('prodSellerKey').value;
    const update = new Date().toLocaleDateString('pt-BR');

    const msg = document.getElementById('adminMsg');

    try {
        const res = await fetch('/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                role: currentUser.role,
                name, type, category, price_daily, price_weekly, price_monthly, price_lifetime, expires, status, seller_key, update, image_url
            })
        });

        const data = await res.json();
        if (res.ok) {
            msg.style.color = '#00ff00';
            msg.innerText = 'Produto criado com sucesso!';
            await fetchProducts();
            setTimeout(() => loadDashContent('admin'), 1000);
        } else {
            msg.style.color = 'red';
            msg.innerText = data.message || 'Erro ao criar.';
        }
    } catch (err) {
        msg.style.color = 'red';
        msg.innerText = 'Erro de conexão.';
    }
}

async function updateProduct() {
    const name = document.getElementById('prodName').value;
    const type = document.getElementById('prodType').value;
    const image_url = document.getElementById('prodImageUrl').value;
    const category = document.getElementById('prodCategory').value;
    const price_daily = parseFloat(document.getElementById('prodPriceDaily').value) || 0;
    const price_weekly = parseFloat(document.getElementById('prodPriceWeekly').value) || 0;
    const price_monthly = parseFloat(document.getElementById('prodPriceMonthly').value) || 0;
    const price_lifetime = parseFloat(document.getElementById('prodPriceLifetime').value) || 0;
    const expires = document.getElementById('prodExpires').value;
    const status = document.getElementById('prodStatus').value;
    const seller_key = document.getElementById('prodSellerKey').value;

    const msg = document.getElementById('adminMsg');

    try {
        const res = await fetch(`/products/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                role: currentUser.role,
                name, type, category, price_daily, price_weekly, price_monthly, price_lifetime, expires, status, seller_key, image_url
            })
        });

        const data = await res.json();
        if (res.ok) {
            msg.style.color = '#00ff00';
            msg.innerText = 'Produto atualizado com sucesso!';
            isEditing = false;
            editingId = null;
            await fetchProducts();
            setTimeout(() => loadDashContent('admin'), 1000);
        } else {
            msg.style.color = 'red';
            msg.innerText = data.message || 'Erro ao atualizar.';
        }
    } catch (err) {
        msg.style.color = 'red';
        msg.innerText = 'Erro de conexão.';
    }
}

async function deleteProduct(id) {
    const product = productsData.find(p => p.id === id);
    if (!product) return;

    if (!confirm(`Tem certeza que deseja excluir "${product.name}"? Esta ação não pode ser desfeita.`)) {
        return;
    }

    try {
        const res = await fetch(`/products/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: currentUser.role })
        });

        const data = await res.json();
        if (res.ok) {
            alert('Produto removido com sucesso!');
            await fetchProducts();
            loadDashContent('admin');
        } else {
            alert(data.message || 'Erro ao remover produto');
        }
    } catch (err) {
        alert('Erro de conexão ao tentar remover produto');
    }
}


function renderProducts(container) {
    // Filtra apenas produtos com category === 'software' (os 5 produtos padrão)
    const softwareProducts = productsData.filter(p => p.category === 'software');

    if (softwareProducts.length === 0) {
        if (!container.innerHTML.includes('products-grid')) {
            container.insertAdjacentHTML('beforeend', `<div class="products-grid"></div>`);
        }
        const grid = container.querySelector('.products-grid') || container;
        grid.innerHTML = `<p>Nenhum produto disponível no momento.</p>`;
        return;
    }

    let html = `<h2>Loja Oficial - Produtos</h2><div class="products-grid">`;

    softwareProducts.forEach(prod => {
        const lockedClass = prod.hasLicense ? '' : 'locked';
        let actionHTML = '';

        if (prod.hasLicense) {
            // Se tem licença, gera botão de download com estilo utilitário
            actionHTML = `
                <button class="utils-action-btn" onclick="alert('Iniciando Download do ${prod.name}...')">
                    <i class="fa-solid fa-download"></i> Baixar
                </button>
            `;
        } else {
            // Se nao tem licenca, mostra cadeado e opcao de comprar.
            // O overlay é absolute, então a posição no HTML só importa para z-index/parent context.
            // Vamos mantê-lo fora do card-details ou dentro? 
            actionHTML = `
                <div class="locked-overlay" id="overlay-${prod.id}">
                    <i class="fa-solid fa-lock lock-icon-anim" id="lock-${prod.id}" style="font-size: 3rem; margin-bottom: 15px;"></i>
                    <button class="buy-btn" id="btn-${prod.id}" onclick="buyProduct(${prod.id})">COMPRAR</button>
                </div>
            `;
            // Para não quebrar o layout, se bloqueado não adicionamos botão embaixo
        }

        // Data de atualização (simulada ou real)
        const lastUpdate = prod.update_date || 'Recente';

        // Expiração da Key Baseada na Licença do Usuário
        let expirationInfo = prod.expires || 'N/A';

        if (prod.hasLicense && prod.licenseExpiresAt) {
            if (prod.licenseExpiresAt === 'LIFETIME') {
                expirationInfo = '<span style="color:#00bd9d; font-weight:bold;">Vitalício</span>';
            } else {
                const expDate = new Date(prod.licenseExpiresAt);
                const now = new Date();
                const diffTime = expDate - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays > 0) {
                    expirationInfo = `<span style="color:#00ff88; font-weight:bold;">${diffDays} Dias Restantes</span>`;
                } else {
                    expirationInfo = `<span style="color:red; font-weight:bold;">Expirado</span>`;
                    // Se expirado, bloqueia novamente visualmente?
                    // Por enquanto mostra expirado.
                }
            }
        }


        // Lógica de exibição: Overlay (se existir) fica "solto" no card (position absolute).
        // Botão de download (se existir) vai dentro de card-details com margin-top: auto.

        let buttonRender = '';
        let overlayRender = '';

        if (prod.hasLicense) {
            buttonRender = actionHTML;
        } else {
            overlayRender = actionHTML;
        }

        const imageStyle = prod.image_url ? `style="background: url('${prod.image_url}') center/cover no-repeat !important;"` : '';

        html += `
        <div class="product-card ${lockedClass}" id="card-${prod.id}">
            <div class="card-image" ${imageStyle}>
                <div class="card-title-overlay">${prod.name}</div>
            </div>
            ${overlayRender}
            
            <div class="card-details">
                <div><span class="label">Status</span> <span class="status-active">${prod.status || 'Undetected'}</span></div>
                <div><span class="label">Validade</span> <span>${expirationInfo}</span></div>
                <div><span class="label">Atualização</span> <span>${lastUpdate}</span></div>
                
                <div style="margin-top:auto; padding-top:10px;">
                    ${buttonRender}
                </div>
            </div>
        </div>
        `;
    });


    // --- CARDS UTILITÁRIOS (ADICIONADOS AO FINAL) ---

    // 1. Card de Ferramentas
    html += `
    <div class="product-card card-utils">
        <div class="card-image">
             <i class="fa-solid fa-gear"></i>
             <div class="card-title-overlay" style="background:transparent; padding:0; bottom: 15px; width:100%; text-align:center;">Ferramentas</div>
        </div>
        <div class="card-details">
            <div class="utils-btn-group">
                <button class="utils-action-btn" onclick="fixErrors()">
                    <i class="fa-solid fa-wrench"></i> Corrigir Erros
                </button>
                <button class="utils-action-btn" onclick="downloadDependencies()">
                    <i class="fa-solid fa-download"></i> Baixar Drivers
                </button>
            </div>
        </div>
    </div>
    `;

    // 2. Card de Resgate de Key
    html += `
    <div class="product-card card-utils">
        <div class="card-image">
             <i class="fa-solid fa-key"></i>
             <div class="card-title-overlay" style="background:transparent; padding:0; bottom: 15px; width:100%; text-align:center;">Resgatar Key</div>
        </div>
        <div class="card-details">
            <div class="redeem-input-group">
                <input type="text" id="redeemKeyInput" placeholder="Sua Key aqui...">
                <button class="utils-action-btn" onclick="redeemKey()">
                    <i class="fa-solid fa-check"></i> Ativar Produto
                </button>
            </div>
        </div>
    </div>
    `;

    html += `</div>`;
    container.innerHTML = html;
}

function renderAddons(container) {
    const addonProducts = productsData.filter(p => p.category === 'addon');

    // Remove "placeholder" text if exists
    const placeholder = container.querySelector('p');
    if (placeholder && placeholder.innerText.includes('Nenhum addon')) {
        placeholder.remove();
    }

    if (addonProducts.length === 0) {
        container.insertAdjacentHTML('beforeend', `<p>Nenhum conteúdo adicional encontrado.</p>`);
        return;
    }

    let html = `<div class="products-grid">`;

    addonProducts.forEach(prod => {
        // Addons logic: free or need buy? Assuming same logic mostly, but maybe simplified.
        // User implied: "Ao criar um conteúdo, ele deve ir para exposição em 'Conteúdos Adicionais'"

        const lockedClass = prod.hasLicense ? '' : 'locked';
        let actionHTML = '';

        if (prod.hasLicense || prod.price === 0) {
            actionHTML = `<button class="download-btn" onclick="alert('Baixando Conteúdo...')"><i class="fa-solid fa-download"></i> Baixar</button>`;
        } else {
            actionHTML = `
                <div class="locked-overlay" id="overlay-${prod.id}">
                    <i class="fa-solid fa-lock lock-icon-anim" id="lock-${prod.id}"></i>
                    <button class="buy-btn" id="btn-${prod.id}" onclick="buyProduct(${prod.id})">ADQUIRIR</button>
                </div>
            `;
        }

        html += `
        <div class="product-card ${lockedClass}" id="card-${prod.id}">
            <h4 style="color:var(--primary-color); padding: 10px;">${prod.name}</h4>
            <div style="padding: 0 10px;">
                <span class="badge" style="background:#444; font-size:0.75rem;">${prod.type}</span>
            </div>
            ${actionHTML}
        </div>
        `;
    });
    html += `</div>`;

    // Append to container existing content
    container.insertAdjacentHTML('beforeend', html);
}

// --- LOJA E REVENDEDORES ---

let resellersData = [];

async function fetchResellers() {
    try {
        const res = await fetch(`${API_BASE_URL}/resellers`);
        const data = await res.json();
        resellersData = data.resellers || [];
    } catch (e) {
        console.error("Erro ao buscar revendedores", e);
    }
}

async function buyProduct(id) {
    const product = productsData.find(p => p.id === id);
    if (!product) return;

    // Novo fluxo: Mostrar Modal de Loja/Revendedores
    showStoreModal(product);
}

async function showStoreModal(product) {
    await fetchResellers();

    const modal = document.getElementById('planModal'); // Reutilizando ou criando novo, vamos usar um novo ID idealmente, mas editarei o HTML depois.
    // Vamos injetar o HTML do modal dinamicamente ou usar um existente.
    // O user pediu "uma aba que aparece Nossa loja: ... abaixo ... Revendedores Oficiais"

    // Vou criar/ar-reutilizar o 'planModal' por enquanto, renomeando-o visualmente
    const content = document.querySelector('#planModal .modal-content');
    modal.style.display = 'flex';

    let html = `
        <span class="close" onclick="closePlanModal()">&times;</span>
        <h2><i class="fa-solid fa-cart-shopping" style="color: var(--primary-color);"></i> Onde Comprar</h2>
        <p style="color: #ccc; margin-bottom: 20px;">Adquira <strong>${product.name}</strong> através de nossos canais oficiais.</p>

        <div class="store-section">
            <h3 style="text-align:left; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px;">
                <i class="fa-solid fa-star" style="color:#ffd700;"></i> Nossa Loja
            </h3>
            <a href="https://discord.gg/seulink" target="_blank" class="store-link-card main-store">
                <div class="store-icon"><i class="fa-brands fa-discord"></i></div>
                <div class="store-info">
                    <h4>Loja Oficial Scarlet</h4>
                    <p>Entre em nosso Discord para comprar</p>
                </div>
                <div class="store-action"><i class="fa-solid fa-arrow-up-right-from-square"></i></div>
            </a>
        </div>

        <div class="store-section" style="margin-top: 30px;">
            <h3 style="text-align:left; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px;">
                <i class="fa-solid fa-users" style="color:#00bd9d;"></i> Revendedores Oficiais
            </h3>
            <div class="resellers-list">
    `;

    if (resellersData.length === 0) {
        html += `<p style="color:#888; font-style:italic;">Nenhum revendedor oficial cadastrado no momento.</p>`;
    } else {
        resellersData.forEach(r => {
            // Se Link não começa com http, adiciona https:// apenas para o href
            let hrefLink = r.link;
            if (!hrefLink.startsWith('http')) {
                hrefLink = 'https://' + hrefLink;
            }
            // Para exibição, remove protocolo se quiser deixar mais limpo
            const displayLink = r.link.replace(/^https?:\/\//, '');

            let imageHTML;
            if (r.logo_url && r.logo_url.trim() !== '') {
                // Tenta carregar imagem, se falhar (onerror) substitui pelo icone
                imageHTML = `<img src="${r.logo_url}" class="store-logo-img" alt="Logo" onerror="this.outerHTML='<div class=\\'store-icon\\'><i class=\\'fa-solid fa-store\\'></i></div>'">`;
            } else {
                imageHTML = `<div class="store-icon"><i class="fa-solid fa-store"></i></div>`;
            }

            html += `
            <a href="${hrefLink}" target="_blank" class="store-link-card reseller">
                ${imageHTML}
                <div class="store-info">
                    <h4>${r.name}</h4>
                    <p class="store-link-text">${displayLink}</p>
                </div>
                <div class="store-action"><i class="fa-solid fa-arrow-up-right-from-square"></i></div>
            </a>
            `;
        });
    }

    html += `</div></div>`;
    content.innerHTML = html;
}


function showPlanModal(product) {
    const modal = document.getElementById('planModal');
    const plansContainer = document.getElementById('plansContainer');

    // Monta os planos disponíveis
    let plansHTML = '';

    if (product.price_daily > 0) {
        plansHTML += `
            <div class="plan-option" onclick="selectPlan(${product.id}, 'daily', ${product.price_daily})">
                <h4>📅 Plano Diário</h4>
                <p class="plan-price">R$ ${product.price_daily.toFixed(2)}</p>
                <p class="plan-desc">Acesso por 1 dia</p>
            </div>
        `;
    }

    if (product.price_weekly > 0) {
        plansHTML += `
            <div class="plan-option" onclick="selectPlan(${product.id}, 'weekly', ${product.price_weekly})">
                <h4>📆 Plano Semanal</h4>
                <p class="plan-price">R$ ${product.price_weekly.toFixed(2)}</p>
                <p class="plan-desc">Acesso por 7 dias</p>
            </div>
        `;
    }

    if (product.price_monthly > 0) {
        plansHTML += `
            <div class="plan-option" onclick="selectPlan(${product.id}, 'monthly', ${product.price_monthly})">
                <h4>📊 Plano Mensal</h4>
                <p class="plan-price">R$ ${product.price_monthly.toFixed(2)}</p>
                <p class="plan-desc">Acesso por 30 dias</p>
                <span class="badge-popular">POPULAR</span>
            </div>
        `;
    }

    if (product.price_lifetime > 0) {
        plansHTML += `
            <div class="plan-option plan-lifetime" onclick="selectPlan(${product.id}, 'lifetime', ${product.price_lifetime})">
                <h4>👑 Plano Lifetime</h4>
                <p class="plan-price">R$ ${product.price_lifetime.toFixed(2)}</p>
                <p class="plan-desc">Acesso vitalício</p>
                <span class="badge-best">MELHOR VALOR</span>
            </div>
        `;
    }

    if (plansHTML === '') {
        plansHTML = '<p style="text-align:center; color:#aaa;">Nenhum plano disponível para este produto.</p>';
    }

    plansContainer.innerHTML = plansHTML;
    modal.style.display = 'flex';
}

function closePlanModal() {
    document.getElementById('planModal').style.display = 'none';
}

async function selectPlan(productId, planType, price) {
    closePlanModal();

    const product = productsData.find(p => p.id === productId);
    if (!product) return;

    selectedPlan = planType;
    pendingProductId = productId;

    if (!confirm(`Confirmar compra de ${product.name} - Plano ${planType.toUpperCase()} por R$ ${price.toFixed(2)}?`)) {
        return;
    }

    // Gera PIX com o plano selecionado
    try {
        const response = await fetch(`${API_BASE_URL}/pay/pix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, productId, planType, price })
        });
        const data = await response.json();

        if (data.qrcode) {
            // Abre modal de pagamento
            openPaymentModal(data.qrcode, data.copiaecola, productId);
        } else {
            alert('Erro ao gerar pagamento: ' + data.message);
        }
    } catch (e) {
        console.error(e);
        alert('Erro de comunicação com o servidor.');
    }
}

function openPaymentModal(qrImgUrl, copyPasteCode, prodId) {
    const modal = document.getElementById('paymentModal');
    const img = document.getElementById('pixQrImg');
    const input = document.getElementById('pixCopyPaste');
    const status = document.getElementById('paymentStatus');

    img.src = qrImgUrl;
    input.value = copyPasteCode;
    status.innerText = "Aguardando pagamento...";
    status.style.color = "#ccc";

    pendingProductId = prodId; // Salva qual produto está sendo comprado
    modal.style.display = 'flex';
}

function closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
    pendingProductId = null;
}

function copyPixCode() {
    const input = document.getElementById('pixCopyPaste');
    input.select();
    document.execCommand('copy');
    alert("Código PIX copiado!");
}

// Simula verificação (Em produção isso seria via Webhook ou Polling)
async function verifyPayment() {
    if (!pendingProductId) return;

    const status = document.getElementById('paymentStatus');
    status.innerText = "Verificando pagamento...";
    status.style.color = "yellow";

    // Simula delay de verificação
    setTimeout(async () => {
        // Confirma compra no backend
        try {
            const res = await fetch(`${API_BASE_URL}/purchase`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id, productId: pendingProductId })
            });

            if (res.ok) {
                status.innerText = "Pagamento Confirmado!";
                status.style.color = "#00ff00";

                // Sucesso visual
                setTimeout(() => {
                    closePaymentModal();
                    runUnlockAnimation(pendingProductId);
                }, 1000);
            } else {
                status.innerText = "Pagamento ainda não identificado. Tente novamente em instantes.";
                status.style.color = "orange";
            }
        } catch (e) {
            status.innerText = "Erro ao verificar.";
            status.style.color = "red";
        }
    }, 1500);
}

function runUnlockAnimation(id) {
    const product = productsData.find(p => p.id === id);
    if (!product) return;

    // Atualiza estado local
    product.hasLicense = true;

    // Mesma lógica de animação anterior
    const overlay = document.getElementById(`overlay-${id}`);
    const card = document.getElementById(`card-${id}`);

    if (overlay && card) {
        overlay.classList.add('shaking');
        setTimeout(() => {
            overlay.classList.remove('shaking');
            overlay.classList.add('falling');
            card.classList.remove('locked');
            card.classList.add('glowing-card');

            showSuccessToast(product.name);

            // Re-render after animation
            setTimeout(() => {
                const container = document.getElementById('dashDynamicContent');
                // Se ainda estiver na tela de install
                if (document.querySelector('.active-tab').innerText.includes('Instalação')) {
                    renderProducts(container);
                }
            }, 1000);

        }, 800);
    }
}

// Helper para placeholders
function renderAddonPlaceholder() {
    return `<p>Nenhum addon disponível ainda.</p>`;
}

// Funções utilitárias de Update Profile (mantidas mas chamadas so no onclick)
async function updateProfile() {
    const newEmail = document.getElementById('updateEmail').value;
    const newPass = document.getElementById('updatePass').value;
    const msg = document.getElementById('updateMsg');


    if (!newEmail && !newPass && !pendingProfilePic) {
        msg.style.color = 'yellow';
        msg.innerText = 'Preencha ao menos um campo.';
        return;
    }

    try {
        const payload = {
            userId: currentUser.id,
            newEmail: newEmail,
            newPassword: newPass
        };

        if (pendingProfilePic) {
            payload.profilePic = pendingProfilePic;
        }

        const response = await fetch(`${API_BASE_URL}/update-profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            msg.style.color = '#00ff00';
            msg.innerText = data.message;
            if (newEmail) currentUser.email = newEmail;
            if (pendingProfilePic) {
                currentUser.profile_pic = pendingProfilePic;
                pendingProfilePic = null; // Reset
                updateUserProfileUI(currentUser);
            }
            localStorage.setItem('scarlet_user', JSON.stringify(currentUser));
        } else {
            msg.style.color = 'red';
            msg.innerText = data.message;
        }
    } catch (e) {
        msg.style.color = 'red';
        msg.innerText = 'Erro ao conectar.';
    }
}

function showSuccessToast(productName) {
    showNotify('success', `Você acabou de resgatar o <strong>${productName}</strong>!`);
}



// --- DISCORD FUNCTIONS ---
async function linkDiscord() {
    // Redirect to backend OAuth flow
    window.location.href = `${API_BASE_URL}/auth/discord/redirect?userId=${currentUser.id}`;
}

// Check for Discord Link Success on Load
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const discordStatus = urlParams.get('discord_linked');

    if (discordStatus === 'success') {
        showNotify('success', 'Discord vinculado com sucesso!');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
        // Force sync user data as background update happened
        const stored = localStorage.getItem('scarlet_user');
        if (stored) {
            const u = JSON.parse(stored);
            syncUserSettings(u.id).then(() => {
                // Refresh dashboard if needed (or just let the user nav)
            });
        }
    } else if (discordStatus === 'error') {
        showNotify('error', 'Erro ao vincular Discord.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

async function unlinkDiscord() {
    if (!confirm("Deseja desvincular sua conta do Discord?")) return;

    try {
        const res = await fetch(`${API_BASE_URL}/unlink-discord`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });

        if (res.ok) {
            showNotify('success', 'Discord desvinculado.');
            currentUser.discord_id = null;
            currentUser.discord_username = null;
            currentUser.discord_avatar = null;
            currentUser.use_discord_avatar = false;

            // Revert profile pic if it was using discord
            // We'll need to sync settings to get the original stored pic or just fallback
            await syncUserSettings(currentUser.id);
            loginSuccess(currentUser);
        }
    } catch (e) {
        showNotify('error', 'Erro ao desvincular');
    }
}

async function toggleDiscordAvatar(checked) {
    try {
        const res = await fetch(`${API_BASE_URL}/toggle-discord-avatar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, useAvatar: checked })
        });

        if (res.ok) {
            currentUser.use_discord_avatar = checked;
            // Update profile pic logic
            if (checked && currentUser.discord_avatar) {
                currentUser.profile_pic = currentUser.discord_avatar;
            } else {
                // Revert -> Sync to get DB value or just reload
                await syncUserSettings(currentUser.id);
                return; // Sync handles UI update
            }
            localStorage.setItem('scarlet_user', JSON.stringify(currentUser));
            updateUserProfileUI(currentUser);
            renderSettingsContent(); // Re-render checkbox state
        }
    } catch (e) {
        console.error(e);
        showNotify('error', 'Erro ao atualizar');
    }
}

// --- FUNÇÕES UTILITÁRIAS PARA OS CARDS NOVOS ---

// --- DOCS / CORREÇÃO DE ERROS ---
// --- PARTNERS DASHBOARD FUNCTIONS ---

// --- PARTNER APPS DASHBOARD ---
let currentAppId = null;

async function loadPartnerApps() {
    const container = document.getElementById('dashDynamicContent');
    container.innerHTML = `
        <div class="dash-header-clean">
            <h2><i class="fa-solid fa-cubes"></i> Minhas Aplicações</h2>
            <button class="keyauth-btn" onclick="showCreateAppModal()" style="max-width: 180px; font-family: 'Inter', sans-serif; font-weight: 500;">
                <i class="fa-solid fa-plus"></i> NOVA APLICAÇÃO
            </button>
        </div>
        <div id="appsListContainer" class="keyauth-grid">
            <div class="loading-spinner"></div>
        </div>
    `;

    try {
        const response = await fetch(`/api/app/list/${currentUser.id}`);
        const data = await response.json();

        const list = document.getElementById('appsListContainer');
        list.innerHTML = '';

        if (!data.apps || data.apps.length === 0) {
            list.innerHTML = '<p class="empty-state" style="grid-column: 1/-1; text-align: center; color: #888;">Você ainda não tem aplicações criadas.</p>';
            return;
        }

        data.apps.forEach(app => {
            const card = document.createElement('div');
            card.className = 'keyauth-card';
            card.style.position = 'relative';
            card.innerHTML = `
                <div class="keyauth-card-header">
                    <h3 class="keyauth-card-title">${app.name}</h3>
                    <span class="keyauth-badge ${app.status === 'active' ? 'active' : 'disabled'}">
                        ${app.status.toUpperCase()}
                    </span>
                </div>
                <div class="keyauth-card-body" style="font-family: 'JetBrains Mono', monospace;">
                    
                    <div class="keyauth-detail-group">
                        <span class="keyauth-label">Application Name</span>
                        <div class="keyauth-value-box">
                            <span>${app.name}</span>
                            <i class="fa-regular fa-copy" title="Copiar Nome" onclick="navigator.clipboard.writeText('${app.name}').then(()=>alert('Nome Copiado!'))"></i>
                        </div>
                    </div>

                    <div class="keyauth-detail-group">
                        <span class="keyauth-label">Owner ID</span>
                        <div class="keyauth-value-box">
                            <span>${app.ownerId}</span>
                            <i class="fa-regular fa-copy" title="Copiar ID" onclick="navigator.clipboard.writeText('${app.ownerId}').then(()=>alert('ID Copiado!'))"></i>
                        </div>
                    </div>

                    <div class="keyauth-detail-group">
                        <span class="keyauth-label">Application Secret</span>
                        <div class="keyauth-value-box">
                            <span>${app.secret.substring(0, 35)}...</span>
                            <i class="fa-regular fa-copy" title="Copiar Secret" onclick="navigator.clipboard.writeText('${app.secret}').then(()=>alert('Secret Copiado!'))"></i>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; margin-top:5px;">
                         <div class="keyauth-detail-group">
                            <span class="keyauth-label">Version</span>
                            <div style="color:#fff; font-weight:600; font-family:'JetBrains Mono', monospace;">${app.version}</div>
                         </div>
                         <div class="keyauth-detail-group" style="text-align:right;">
                            <span class="keyauth-label">Status</span>
                            <div style="color:${app.status === 'active' ? '#00ff88' : '#ff4444'}; font-weight:600; font-family:'JetBrains Mono', monospace;">${app.status === 'active' ? 'UNDETECTED' : 'DETECTED'}</div>
                         </div>
                    </div>

                    <div class="keyauth-actions">
                        <button onclick="openAppDashboard('${app.id}', '${app.name}')" class="keyauth-btn" style="font-family: 'Inter', sans-serif; font-weight: 500;">
                            <i class="fa-solid fa-gear"></i> GERENCIAR
                        </button>
                    </div>
                </div>
            `;
            list.appendChild(card);
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="error">Erro ao carregar aplicações.</p>';
    }
}

function showCreateAppModal() {
    const name = prompt("Nome da Aplicação:");
    if (name) createApp(name);
}

async function createApp(name) {
    try {
        const res = await fetch('/api/app/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, name })
        });
        const data = await res.json();
        if (res.ok) {
            showNotify('success', "Aplicação criada!");
            loadPartnerApps();
        } else {
            showNotify('error', data.message);
        }
    } catch (e) {
        showNotify('error', "Erro ao criar");
    }
}

async function openAppDashboard(appId, appName) {
    currentAppId = appId;
    const container = document.getElementById('dashDynamicContent');

    container.innerHTML = `
        <div class="dash-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:15px;">
                <button class="btn-outline" onclick="loadPartnerApps()" style="padding:5px 10px;"><i class="fa-solid fa-arrow-left"></i></button>
                <h2 style="margin:0;"><i class="fa-solid fa-rocket"></i> ${appName}</h2>
            </div>
        </div>
        
        <div class="app-dashboard-tabs" style="display:flex; gap:10px; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:20px;">
            <button class="subtab-btn active" onclick="switchAppTab('overview', this)">Visão Geral</button>
            <button class="subtab-btn" onclick="switchAppTab('keys', this)">Keys</button>
            <button class="subtab-btn" onclick="switchAppTab('users', this)">Usuários</button>
            <button class="subtab-btn" onclick="switchAppTab('logs', this)">Logs</button>
            <button class="subtab-btn" onclick="switchAppTab('settings', this)">Configurações</button>
        </div>

        <div id="appTabContent" class="app-content-area">
            <!-- Dynamic Content -->
        </div>
    `;

    // Auto load overview
    const firstBtn = container.querySelector('.app-dashboard-tabs .subtab-btn');
    switchAppTab('overview', firstBtn);
}

async function switchAppTab(tab, btnElement) {
    const container = document.getElementById('appTabContent');

    // Update active class
    if (btnElement) {
        document.querySelectorAll('.app-dashboard-tabs .subtab-btn').forEach(btn => btn.classList.remove('active'));
        btnElement.classList.add('active');
    }

    // Load Content
    if (tab === 'overview') await loadAppOverview(currentAppId, container);
    if (tab === 'keys') await loadAppKeys(currentAppId, container);
    if (tab === 'users') await loadAppUsers(currentAppId, container);
    if (tab === 'logs') await loadAppLogs(currentAppId, container);
    if (tab === 'settings') await loadAppSettings(currentAppId, container);
}

// --- LOGS UI ---
let currentLogsPage = 1;
let currentLogsAppId = null;

async function loadAppLogs(appId, container) {
    currentLogsPage = 1;
    currentLogsAppId = appId;

    container.innerHTML = `
        <div class="ka-container">
             <div class="ka-action-bar">
                <h3><i class="fa-solid fa-list"></i> Login Logs</h3>
            </div>

            <div class="ka-table-wrapper">
                <table class="ka-table">
                    <thead>
                        <tr>
                            <th>User/Key</th>
                            <th>IP Address</th>
                            <th>HWID</th>
                            <th>Time</th>
                            <th>Components</th>
                        </tr>
                    </thead>
                    <tbody id="logsTableBody">
                        <!-- Logs here -->
                    </tbody>
                </table>
            </div>
            
            <div style="text-align:center; padding:10px;">
                <button id="btnLoadMoreLogs" class="btn-outline" style="display:none;" onclick="loadMoreLogs()">Load More</button>
            </div>
        </div>

        <!-- Simple Modal for Components -->
        <div id="compModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999; align-items:center; justify-content:center;">
            <div style="background:#1a1a1a; padding:20px; border-radius:8px; width:300px; border:1px solid #333;">
                <h4 style="margin-top:0;">Hardware Specs</h4>
                <div id="compModalContent" style="font-size:0.9rem; color:#ccc; margin-bottom:15px; line-height:1.5;"></div>
                <button class="btn-primary" style="width:100%;" onclick="document.getElementById('compModal').style.display='none'">Close</button>
            </div>
        </div>
    `;

    await fetchAndRenderLogs(true);
}

async function loadMoreLogs() {
    currentLogsPage++;
    await fetchAndRenderLogs(false);
}

async function fetchAndRenderLogs(reset) {
    const tbody = document.getElementById('logsTableBody');
    const btnMore = document.getElementById('btnLoadMoreLogs');

    if (reset) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Loading logs...</td></tr>';
        btnMore.style.display = 'none';
    } else {
        btnMore.innerHTML = 'Loading...';
        btnMore.disabled = true;
    }

    try {
        const res = await fetch(`/api/app/${currentLogsAppId}/logs?page=${currentLogsPage}&limit=20`);
        const data = await res.json();

        if (reset) tbody.innerHTML = '';

        if (data.logs && data.logs.length > 0) {
            data.logs.forEach(log => {
                let compBtn = '<span style="color:#666">N/A</span>';

                if (log.components) {
                    // Store comp data in a data attribute or safely passed
                    // We'll use a globally accessible helper or simple JSON string trick for this small scale
                    // Better: standard onclick calling a function with params
                    // But parsing JSON in onclick string is messy.
                    // Let's attach event listener? No, dynamic elements.
                    // We'll use a hack to store it in a hidden value or just base64 encode it?
                    // Easiest: `showCompDetails('${btoa(JSON.stringify(log.components))}')`
                    const compStr = btoa(JSON.stringify(log.components));
                    compBtn = `<button class="btn-outline btn-sm" onclick="showCompDetails('${compStr}')"><i class="fa-solid fa-ellipsis"></i></button>`;
                }

                const tr = document.createElement('tr');
                tr.className = 'ka-list-item';
                tr.innerHTML = `
                    <td><span style="color:#fff; font-weight:600;">${log.key_or_username}</span></td>
                    <td style="font-family:monospace; color:#888;">${log.ip}</td>
                    <td style="font-family:monospace; color:#aaa; font-size:0.8rem;">${log.hwid ? log.hwid.substring(0, 15) + '...' : 'N/A'}</td>
                    <td style="color:#888;">${new Date(log.timestamp).toLocaleString()}</td>
                    <td>${compBtn}</td>
                `;
                tbody.appendChild(tr);
            });
        } else if (reset) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">No logs found.</td></tr>';
        }

        // Handle "Load More" button
        if (data.hasMore) {
            btnMore.style.display = 'inline-block';
            btnMore.innerHTML = 'Load More';
            btnMore.disabled = false;
        } else {
            btnMore.style.display = 'none';
        }

    } catch (e) {
        console.error(e);
        if (reset) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Error loading logs</td></tr>';
    }
}

function showCompDetails(base64Json) {
    try {
        const comps = JSON.parse(atob(base64Json));
        const modal = document.getElementById('compModal');
        const content = document.getElementById('compModalContent');

        content.innerHTML = `
            <strong>GPU:</strong> ${comps.gpu || 'N/A'}<br>
            <strong>CPU:</strong> ${comps.cpu || 'N/A'}<br>
            <strong>MOBO:</strong> ${comps.motherboard || 'N/A'}<br>
            <br>
            <small style="color:#666">Recorded: ${new Date(comps.recorded_at || Date.now()).toLocaleString()}</small>
        `;

        modal.style.display = 'flex';
    } catch (e) {
        console.error("Error showing details", e);
    }
}

async function loadAppOverview(appId, container) {
    container.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const res = await fetch(`/api/app/${appId}/stats`);
        const stats = await res.json();

        container.innerHTML = `
        < div class= "stats-grid" style = "display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;" >
                <div class="product-card" style="text-align: center; padding: 20px;">
                    <h3 style="color:#888; font-size: 1rem;">Usuários Totais</h3>
                    <p class="stat-number" style="font-size: 2.5rem; font-weight: bold; margin: 10px 0;">${stats.users || 0}</p>
                </div>
                <div class="product-card" style="text-align: center; padding: 20px;">
                    <h3 style="color:#888; font-size: 1rem;">Keys Geradas</h3>
                    <p class="stat-number" style="font-size: 2.5rem; font-weight: bold; margin: 10px 0;">${stats.keys || 0}</p>
                </div>
                <div class="product-card" style="text-align: center; padding: 20px;">
                    <h3 style="color:#888; font-size: 1rem;">Sessões Ativas</h3>
                    <p class="stat-number" style="font-size: 2.5rem; font-weight: bold; margin: 10px 0; color: #00bd9d;">0</p> 
                </div>
            </div >

            <div class="quick-actions" style="margin-top:20px;">
                <h3>Ações Rápidas</h3>
                <div class="action-buttons" style="display:flex; gap:10px; margin-top:10px;">
                    <button class="cta-button" onclick="document.querySelectorAll('.subtab-btn')[1].click()">Gerenciar Keys</button>
                    <button class="btn-outline" onclick="showGenerateKeysModal('${appId}')">Gerar Keys Rápidas</button>
                </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = "Erro ao carregar stats.";
    }
}


// --- KEYAUTH STYLE KEYS UI ---
let currentKeysData = []; // Store for filtering
let lastCreatedKeys = null; // Store just-created keys

async function loadAppKeys(appId, container) {
    let keysDisplayHtml = '';
    if (lastCreatedKeys) {
        keysDisplayHtml = `
            < div class="ka-container" style = "margin-bottom: 20px; border-color: #00bcd4; background: rgba(0, 188, 212, 0.05);" >
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h3 style="margin:0; font-size:1rem; color:#00bcd4;"><i class="fa-solid fa-check-circle"></i> Licenses Created</h3>
                    <button class="ka-btn" onclick="navigator.clipboard.writeText('${lastCreatedKeys.join('\\n')}').then(()=>alert('Copied All!'))">
                        <i class="fa-regular fa-copy"></i> Copy All
                    </button>
                </div>
                <div style="background:rgba(0,0,0,0.3); padding:15px; border-radius:4px; max-height:150px; overflow-y:auto; font-family:'JetBrains Mono', monospace; font-size:0.9rem; border:1px solid rgba(255,255,255,0.1);">
                    ${lastCreatedKeys.map(k => `<div>${k}</div>`).join('')}
                </div>
                <div style="margin-top:10px; text-align:right;">
                    <button class="ka-btn danger" style="padding:5px 10px; font-size:0.8rem;" onclick="clearCreatedKeys('${appId}')">Close</button>
                </div>
            </div >
            `;
    }

    container.innerHTML = `
        ${keysDisplayHtml}
        <div class="ka-container">
            <div class="ka-action-bar">
                <div class="ka-search-box">
                    <i class="fa-solid fa-search"></i>
                    <input type="text" id="keysSearch" placeholder="Search licenses..." onkeyup="filterKeys(this.value)">
                </div>
                <div class="ka-actions">
                    <button class="ka-btn ka-btn-primary" onclick="openCreateLicenseModal('${appId}')">
                        <i class="fa-solid fa-plus"></i> Create License
                    </button>
                    <button class="ka-btn danger" onclick="deleteBulkKeys('${appId}')">
                        <i class="fa-solid fa-trash"></i> Delete Unused
                    </button>
                </div>
            </div>

            <div class="ka-table-wrapper">
                <table class="ka-table">
                    <thead>
                        <tr>
                            <th>License</th>
                            <th>Note</th>
                            <th>Level</th>
                            <th>Duration</th>
                            <th>Status/Used By</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="keysTableBody">
                        <tr><td colspan="7" style="text-align:center; padding:20px;">Loading licenses...</td></tr>
                    </tbody>
                </table>
            </div>

            <p id="keysCountLabel" style="margin-top:15px; font-size:0.8rem; color:#666;"></p>
        </div>
        `;

    try {
        const res = await fetch(`/api/app/${appId}/keys`);
        const data = await res.json();
        const tbody = document.getElementById('keysTableBody');

        if (data.keys) {
            currentKeysData = data.keys; // Save for filter
            renderKeysTable(data.keys);
        } else {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Error loading keys</td></tr>';
        }

    } catch (e) {
        console.error(e);
        document.getElementById('keysTableBody').innerHTML = '<tr><td colspan="7" style="text-align:center;">Error loading keys</td></tr>';
    }
}

function clearCreatedKeys(appId) {
    lastCreatedKeys = null;
    loadAppKeys(appId, document.getElementById('appTabContent'));
}

function renderKeysTable(keys) {
    const tbody = document.getElementById('keysTableBody');
    const countLabel = document.getElementById('keysCountLabel');
    tbody.innerHTML = '';

    if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#888;">No licenses found.</td></tr>';
        countLabel.innerText = "Showing 0 licenses";
        return;
    }

    keys.forEach(k => {
        const isUsed = k.status === 'used';
        const tr = document.createElement('tr');
        tr.className = 'ka-list-item';
        tr.innerHTML = `
            <td>
                <span class="ka-key-text" onclick="navigator.clipboard.writeText('${k.key}')" style="cursor:pointer" title="Click to copy">
                    ${k.key}
                </span>
            </td>
            <td style="color:#aaa;">${k.note || '<span style="color:#444">N/A</span>'}</td>
            <td>${k.level || 1}</td>
            <td>${k.days} Day(s)</td>
            <td>
                <span class="ka-status ${k.status}">${k.status}</span>
                ${isUsed ? `<br><small style="color:#666; font-size:0.7rem;">${k.hwid ? k.hwid.substring(0, 10) + '...' : 'Unknown'}</small>` : ''}
            </td>
            <td style="color:#888;">${new Date(k.created_at).toLocaleDateString()}</td>
            <td>
                <button class="ka-btn danger" style="padding:4px 8px; font-size:0.75rem;" onclick="deleteAppKey('${k.appId}', '${k.id}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    countLabel.innerText = `Showing ${keys.length} licenses`;
}

function filterKeys(query) {
    const lowerQ = query.toLowerCase();
    const filtered = currentKeysData.filter(k =>
        k.key.toLowerCase().includes(lowerQ) ||
        (k.note && k.note.toLowerCase().includes(lowerQ)) ||
        (k.status.toLowerCase().includes(lowerQ))
    );
    renderKeysTable(filtered);
}

// --- NEW MODAL FOR LICENSE ---
function openCreateLicenseModal(appId) {
    // Remove existing if any
    const existing = document.getElementById('createLicenseModal');
    if (existing) existing.remove();

    // Default values
    const defAmount = localStorage.getItem('last_amount') || 1;
    const defMask = localStorage.getItem('last_mask') || '';
    const defLevel = localStorage.getItem('last_level') || 1;
    const defUnit = localStorage.getItem('last_unit') || 'days';
    const defDur = localStorage.getItem('last_dur') || 30;

    const modalHtml = `
    <div id="createLicenseModal" class="ka-modal-overlay">
        <div class="ka-modal-content">
            <div class="ka-modal-header">
                <h3>Create a new license</h3>
                <i class="fa-solid fa-xmark" style="cursor:pointer; color:#888;" onclick="this.closest('.ka-modal-overlay').remove()"></i>
            </div>
            <div class="ka-modal-body">
                 <div class="ka-form-group">
                    <label>Amount <span class="required">*</span></label>
                    <input type="number" id="genAmount" value="${defAmount}" min="1">
                 </div>
                 
                 <div class="ka-form-group">
                    <label>License Mask (Optional)</label>
                    <input type="text" id="genMask" placeholder="KEY-******" value="${defMask}">
                    <small style="color:#666; font-size:0.7rem;">Use * for random characters.</small>
                 </div>

                 <div class="ka-form-row">
                     <div class="ka-form-group" style="flex:1">
                        <label>Level</label>
                        <input type="number" id="genLevel" value="${defLevel}">
                     </div>
                     <div class="ka-form-group" style="flex:1">
                        <label>Unit</label>
                        <select id="genUnit">
                            <option value="days" ${defUnit === 'days' ? 'selected' : ''}>Days</option>
                            <option value="lifetime" ${defUnit === 'lifetime' ? 'selected' : ''}>Lifetime</option>
                        </select>
                     </div>
                 </div>

                 <div class="ka-form-group">
                    <label>Duration</label>
                    <input type="number" id="genDuration" value="${defDur}">
                 </div>

                 <div class="ka-form-group">
                    <label>Note</label>
                    <input type="text" id="genNote" placeholder="e.g. Reseller Sale">
                 </div>
            </div>
            <div class="ka-modal-footer">
                <button class="ka-btn" onclick="document.getElementById('createLicenseModal').remove()">Cancel</button>
                <button class="ka-btn ka-btn-primary" onclick="submitCreateLicense('${appId}')">Create License</button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function submitCreateLicense(appId) {
    const count = document.getElementById('genAmount').value;
    const mask = document.getElementById('genMask').value;
    const level = document.getElementById('genLevel').value;
    const unit = document.getElementById('genUnit').value;
    let days = document.getElementById('genDuration').value;
    const note = document.getElementById('genNote').value;

    // Save defaults
    localStorage.setItem('last_amount', count);
    localStorage.setItem('last_mask', mask);
    localStorage.setItem('last_level', level);
    localStorage.setItem('last_unit', unit);
    localStorage.setItem('last_dur', days);

    if (unit === 'lifetime') days = 36500; // 100 years

    try {
        const btn = document.querySelector('#createLicenseModal .ka-btn-primary');
        btn.innerText = "Creating...";
        btn.disabled = true;

        const res = await fetch(`/api/app/${appId}/keys/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, appId, count, days, mask, note, level })
        });

        const data = await res.json();

        if (res.ok) {
            showNotify('success', 'Licenses Created!');
            document.getElementById('createLicenseModal').remove();

            // Show created keys block
            lastCreatedKeys = data.keys;

            // Correctly reload into the existing Tab Content, preserving headers above
            const tabContent = document.getElementById('appTabContent');
            if (tabContent) {
                loadAppKeys(appId, tabContent);
            }
        } else {
            showNotify('error', 'Failed to create');
            console.log(data);
            btn.innerText = "Create License";
            btn.disabled = false;
        }
    } catch (e) {
        console.error(e);
        showNotify('error', 'Network Error');
    }
}

async function deleteAppKey(appId, keyId) {
    if (!confirm("Tem certeza que deseja deletar esta key?")) return;
    try {
        const res = await fetch(`/api/app/${appId}/keys/${keyId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        if (res.ok) {
            showNotify('success', "Key deletada");
            loadAppKeys(appId, document.getElementById('appTabContent'));
        } else {
            showNotify('error', "Erro");
        }
    } catch (e) {
        showNotify('error', "Erro");
    }
}

// --- KEYAUTH STYLE USERS UI ---
let currentUsersData = [];

async function loadAppUsers(appId, container) {
    container.innerHTML = `
        <div class="ka-container">
             <div class="ka-action-bar">
                <div class="ka-search-box">
                    <i class="fa-solid fa-search"></i>
                    <input type="text" id="usersSearch" placeholder="Search users by name/ip..." onkeyup="filterUsers(this.value)">
                </div>
            </div>

            <div class="ka-table-wrapper">
                <table class="ka-table">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>IP Address</th>
                            <th>Expiry</th>
                            <th>Last Login</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="usersTableBody">
                        <tr><td colspan="5" style="text-align:center; padding:20px;">Loading users...</td></tr>
                    </tbody>
                </table>
            </div>
            <p id="usersCountLabel" style="margin-top:15px; font-size:0.8rem; color:#666;"></p>
        </div>
    `;

    try {
        const res = await fetch(`/api/app/${appId}/users`);
        const data = await res.json();

        if (data.users) {
            currentUsersData = data.users;
            renderUsersTable(data.users);
        } else {
            document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="5" style="text-align:center;">Error loading users</td></tr>';
        }

    } catch (e) {
        console.error(e);
        document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="5" style="text-align:center;">Error loading users</td></tr>';
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    const countLabel = document.getElementById('usersCountLabel');
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">No users found.</td></tr>';
        countLabel.innerText = "Showing 0 users";
        return;
    }

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'ka-list-item';
        tr.innerHTML = `
            <td style="font-weight:600; color:#fff;">${u.username}</td>
            <td style="font-family:monospace; color:#888;">${u.ip || 'N/A'}</td>
            <td>${u.expires_at ? new Date(u.expires_at).toLocaleDateString() : 'Lifetime'}</td>
            <td style="color:#aaa;">${u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}</td>
            <td>
                 <button class="ka-btn danger" style="padding:4px 8px; font-size:0.75rem;">
                    <i class="fa-solid fa-ban"></i> Ban
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    countLabel.innerText = `Showing ${users.length} users`;
}

function filterUsers(query) {
    const lowerQ = query.toLowerCase();
    const filtered = currentUsersData.filter(u =>
        u.username.toLowerCase().includes(lowerQ) ||
        (u.ip && u.ip.includes(lowerQ))
    );
    renderUsersTable(filtered);
}

async function loadAppSettings(appId, container) {
    container.innerHTML = `
        <h3>Configurações</h3>
        <div class="status-box">
             <p>As configurações avançadas (Reset HWID global, Download Link, Webhooks) serão implementadas em breve.</p>
        </div>
    `;
}

// --- DOCS DATA ---
const docsData = [

    {
        id: 'auth-error',
        title: 'Erro "Tentando se conectar ao auth" ou "Signature verification failed"',
        solution: '1. Pressione <span style="background:#333; padding:2px 6px; border-radius:4px;">Win + i</span> para abrir as Configurações.<br>2. Vá em <strong>Hora e Idioma</strong> > <strong>Data e Hora</strong>.<br>3. Clique em <strong>Sincronizar agora</strong>. Verifique se o fuso horário está correto.<br>4. Se persistir, reinicie o modem de internet.',
        author: 'zeus',
        date: 'Há 30d'
    },
    {
        id: 'core5-error',
        title: 'Erro "Failed to initialize core #5"',
        solution: '1. Desative temporariamente seu antivírus (Windows Defender, Avast, etc).<br>2. Feche anticheats ativos como Vanguard (Valorant) ou FACEIT.<br>3. Tente injetar novamente pelo menos 3 vezes seguidas.<br>4. Se ainda não funcionar, instale o <a href="#" style="color:var(--primary-color)" onclick="downloadDependencies()">pacote de dependências</a>.',
        author: 'zeus',
        date: 'Há 30d'
    },
    {
        id: 'config-error',
        title: 'Erro "Config file not found"',
        solution: '1. Baixe novamente o Executor/Loader do painel.<br>2. Extraia <strong>TODOS</strong> os arquivos para uma mesma pasta (não execute de dentro do .rar).<br>3. Certifique-se que o arquivo <code>cfg.json</code> ou similar está na mesma pasta do executável.',
        author: 'zeus',
        date: 'Há 30d'
    },
    {
        id: 'inject-error',
        title: 'Erro executor injeta, mas não aparece no jogo',
        solution: '<strong>Solução 1:</strong> Instale o DirectX Runtime e Visual C++ Redistributable.<br><strong>Solução 2:</strong> Execute o jogo em modo "Janela sem Bordas" (Borderless Window).<br><strong>Solução 3:</strong> Desative o overlay do Discord/GeForce Experience.',
        author: 'zeus',
        date: 'Há 30d'
    }
];

function fixErrors() {
    openDocsModal();
}

function openDocsModal() {
    const modal = document.getElementById('docsModal');
    const list = document.getElementById('docsList');

    if (!modal) return;

    // Renderiza lista inicial (estado recolhido)
    list.innerHTML = docsData.map(doc => `
        <div class="doc-card" id="doc-${doc.id}">
            <div class="doc-header" onclick="toggleDoc('${doc.id}')" style="cursor:pointer;">
                <div class="doc-title">${doc.title}</div>
                <div class="doc-meta">
                    <span class="doc-author" style="color:var(--primary-color)">${doc.author}</span>
                    <span><i class="fa-regular fa-clock"></i> ${doc.date}</span>
                    <span style="margin-left:auto"><i class="fa-solid fa-chevron-down"></i></span>
                </div>
            </div>
            <div class="doc-body" id="doc-body-${doc.id}" style="display:none; margin-top:20px; border-top:1px solid #222; padding-top:15px;">
                <div class="doc-solution"><span class="doc-author">Solução:</span> <br> ${doc.solution}</div>
                
                <!-- Sessão de Comentários -->
                <div class="comments-section" id="comments-${doc.id}">
                    <h5 style="color:#888; margin-bottom:10px;">Comentários</h5>
                    <div class="comments-list" id="list-comments-${doc.id}" style="margin-bottom:15px;">
                        <p style="color:#555; font-style:italic;">Carregando...</p>
                    </div>
                    
                    <div class="comment-input-box" style="display:flex; gap:10px;">
                        <input type="text" id="input-comment-${doc.id}" placeholder="Escreva uma dúvida..." style="flex:1; background:#111; border:1px solid #333; color:white; padding:8px; border-radius:4px;">
                        <button class="btn-outline" onclick="submitComment('${doc.id}')"><i class="fa-solid fa-paper-plane"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    modal.style.display = 'flex';
}

function toggleDoc(id) {
    const body = document.getElementById(`doc-body-${id}`);
    const isVisible = body.style.display === 'block';

    body.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
        // Se abriu, carrega comentários
        loadComments(id);
    }
}

async function loadComments(topicId) {
    const list = document.getElementById(`list-comments-${topicId}`);
    try {
        const res = await fetch(`${API_BASE_URL}/comments/${topicId}`);
        const data = await res.json();

        if (data.comments.length === 0) {
            list.innerHTML = '<p style="color:#555; font-size:0.8rem;">Nenhum comentário ainda.</p>';
        } else {
            list.innerHTML = data.comments.map(c => `
                <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; margin-bottom:5px;">
                    <div style="display:flex; justify-content:space-between;">
                        <strong style="color:var(--primary-color); font-size:0.8rem;">${c.username || 'User'}</strong> 
                        <span style="color:#666; font-size:0.7rem;">${new Date(c.date).toLocaleDateString()}</span>
                    </div>
                    <p style="color:#ccc; font-size:0.85rem; margin:2px 0 0 0;">${c.message}</p>
                </div>
            `).join('');
        }
    } catch (e) {
        list.innerHTML = '<p style="color:red; font-size:0.8rem;">Erro ao carregar.</p>';
    }
}

async function submitComment(topicId) {
    const input = document.getElementById(`input-comment-${topicId}`);
    const message = input.value;

    if (!message) return;
    if (!currentUser) {
        alert("Faça login para comentar.");
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topicId,
                userId: currentUser.id,
                username: currentUser.username,
                message
            })
        });

        if (res.ok) {
            input.value = '';
            loadComments(topicId); // Recarrega lista
        } else {
            alert("Erro ao enviar.");
        }
    } catch (e) {
        console.error(e);
    }
}

function closeDocsModal() {
    document.getElementById('docsModal').style.display = 'none';
}

function downloadDependencies() {
    if (confirm("Deseja baixar o pacote de dependências (Visual C++, DirectX)?")) {
        window.open('https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist', '_blank');
    }
}

async function redeemKey() {
    const keyInput = document.getElementById('redeemKeyInput');
    const key = keyInput.value.trim();

    if (!key) {
        alert('Por favor, insira uma key válida.');
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/redeem-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, key })
        });
        const data = await res.json();

        if (res.ok) {
            alert(`Sucesso! O produto "${data.productName}" foi ativado na sua conta.`);
            // Atualiza sessão e recarrega
            await syncLicenses(currentUser.id);
            loadDashContent('install');
        } else {
            alert(data.message || 'Key inválida ou expirada.');
        }
    } catch (e) {
        console.error(e);
        alert('Erro ao validar key. Verifique sua conexão.');
    }
}

// --- FUNÇÕES DO FEED SOCIAL ---

let postsData = [];

async function renderFeed(container) {
    // Busca posts da API
    try {
        const res = await fetch(`${API_BASE_URL}/posts`);
        const data = await res.json();
        postsData = data.posts || [];
    } catch (e) {
        console.error("Erro ao buscar posts:", e);
        postsData = [];
    }

    // Verifica se usuário é content creator
    const isContentCreator = currentUser.is_content_creator || 0;

    // Botão Flutuante de Publicar
    const publishBtn = `
        <button class="fab-publish" onclick="openCreatePostModal()">
            <i class="fa-solid fa-pen-nib"></i> PUBLICAR
        </button>
    `;

    // Modal de Criar Post
    const createPostModal = `
        <div id="createPostModal" class="modal" style="display:none; z-index: 3000;">
            <div class="modal-content create-post-modal-content">
                <span class="close" onclick="closeCreatePostModal()">&times;</span>
                <h3><i class="fa-solid fa-plus-circle"></i> Criar Novo Post</h3>
                <form id="createPostForm" onsubmit="createPost(event)">
                    <div class="input-group">
                        <label>Tipo de Mídia</label>
                        <select id="postMediaType" style="width:100%; padding:10px; background:#222; color:#fff; border:1px solid #444; border-radius:5px;">
                            <option value="image">📷 Imagem</option>
                            ${isContentCreator ? '<option value="video">🎥 Vídeo</option>' : ''}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>URL da Mídia ${isContentCreator ? '(Imagem ou Vídeo)' : '(Imagem)'}</label>
                        <input type="url" id="postMediaUrl" required placeholder="https://... ou arraste uma imagem aqui" style="width:100%;">
                        <small style="color:#888; font-size:0.75rem; display:block; margin-top:5px;">
                            ${isContentCreator ? 'Youtube, Link direto ou Arraste um arquivo' : 'Cole um link ou Arraste uma imagem para este painel'}
                        </small>
                    </div>
                    <div class="input-group">
                        <label>Legenda</label>
                        <textarea id="postCaption" rows="4" style="width:100%; padding:10px; background:#222; color:#fff; border:1px solid #444; border-radius:5px;" placeholder="No que você está pensando?"></textarea>
                    </div>
                    <button type="submit" class="cta-button" style="width:100%;">
                        PUBLICAR AGORA
                    </button>
                </form>
            </div>
        </div>
    `;

    // Separa posts em destaque e normais
    const featuredPosts = postsData.filter(p => p.featured === 1);
    const regularPosts = postsData.filter(p => p.featured !== 1);

    let feedHTML = publishBtn + createPostModal;

    // Seção de posts em destaque
    if (featuredPosts.length > 0) {
        feedHTML += `
            <div class="featured-section">
                <h3><i class="fa-solid fa-star"></i> Em Destaque</h3>
                <div class="featured-grid">
                    ${featuredPosts.map(post => renderPostCard(post, true)).join('')}
                </div>
            </div>
        `;
    }

    // Feed normal
    feedHTML += `
        <div class="feed-section">
            <h3><i class="fa-solid fa-stream"></i> Feed</h3>
            ${regularPosts.length > 0 ?
            regularPosts.map(post => renderPostCard(post, false)).join('') :
            '<p style="text-align:center; color:#888;">Nenhum post ainda. Seja o primeiro a postar!</p>'
        }
        </div>
    `;

    container.insertAdjacentHTML('beforeend', feedHTML);
}

function renderPostCard(post, isFeatured) {
    const isVideo = post.media_type === 'video';
    const isContentCreator = post.is_content_creator === 1;
    const timeAgo = formatTimeAgo(post.created_at);

    // Determina se é vídeo do YouTube
    const isYouTube = post.media_url && (post.media_url.includes('youtube.com') || post.media_url.includes('youtu.be'));
    let embedUrl = post.media_url;

    if (isYouTube) {
        // Converte URL do YouTube para embed
        const videoId = post.media_url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)?.[1];
        if (videoId) {
            embedUrl = `https://www.youtube.com/embed/${videoId}`;
        }
    }

    async function handleSendUpdate(e) {
        e.preventDefault();
        const productId = document.getElementById('updateProdSelect').value;
        const message = document.getElementById('updateMessage').value;
        const product = productsData.find(p => p.id == productId);

        if (!confirm(`Enviar atualização para "${product.name}"? Isso notificará o Discord.`)) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/send-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: currentUser.role,
                    productId,
                    productName: product.name,
                    message
                })
            });

            if (res.ok) {
                alert('Atualização enviada com sucesso!');
                document.getElementById('updateMessage').value = '';
                // Atualiza produtos para refletir nova data
                await fetchProducts();
            } else {
                alert('Erro ao enviar atualização.');
            }
        } catch (err) {
            console.error(err);
            alert('Erro de conexão.');
        }
    }


    const mediaHTML = isVideo ?
        (isYouTube ?
            `<iframe class="post-media-video" src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` :
            `<video class="post-media-video" controls><source src="${post.media_url}" type="video/mp4">Seu navegador não suporta vídeos.</video>`
        ) :
        `<img class="post-media-img" src="${post.media_url}" alt="Post" onerror="this.src='https://via.placeholder.com/400x300?text=Imagem+Indisponível'">`;

    // Fallback inteligente: Se for o próprio usuário, usa a foto da sessão local (que sabemos estar certa)
    // caso o DB ainda não tenha atualizado ou retornado null.
    let profilePicUrl = post.profile_pic;
    if (post.user_id === currentUser.id && currentUser.profile_pic) {
        profilePicUrl = currentUser.profile_pic;
    }
    if (!profilePicUrl) profilePicUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';

    return `
        <div class="post-card ${isFeatured ? 'featured-post' : ''}" id="post-${post.id}">
            <div class="post-header">
                <div class="post-author">
                    <img src="${profilePicUrl}" alt="User" 
                         style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-right: 10px; border: 2px solid var(--primary-color);">
                    <div>
                        <strong>${post.username}</strong>
                        ${isContentCreator ? '<span class="creator-badge">✨ Criador de Conteúdo</span>' : ''}
                        <br>
                        <small style="color:#888;">${timeAgo}</small>
                    </div>
                </div>
                ${(currentUser.id === post.user_id || currentUser.role === 'admin') ?
            `<button class="delete-post-btn" onclick="deletePost(${post.id})" title="Deletar post">
                        <i class="fa-solid fa-trash"></i>
                    </button>` : ''
        }
            </div>
            
            <div class="post-media">
                ${mediaHTML}
            </div>
            
            ${post.caption ? `<div class="post-caption">${post.caption}</div>` : ''}
            
            <div class="post-actions">
                <button class="action-btn like-btn" id="like-btn-${post.id}" onclick="toggleLike(${post.id})">
                    <i class="fa-solid fa-heart"></i>
                    <span id="like-count-${post.id}">${post.likes_count || 0}</span>
                </button>
                <button class="action-btn comment-btn" onclick="togglePostComments(${post.id})">
                    <i class="fa-solid fa-comment"></i>
                    <span>${post.comments_count || 0}</span>
                </button>
            </div>
            
            <div class="post-comments" id="comments-${post.id}" style="display:none;">
                <div class="comments-list" id="comments-list-${post.id}">
                    <p style="text-align:center; color:#888;">Carregando...</p>
                </div>
                <div class="add-comment">
                    <input type="text" id="comment-input-${post.id}" placeholder="Adicione um comentário..." style="flex:1; padding:8px; background:#222; border:1px solid #444; border-radius:5px; color:#fff;">
                    <button onclick="addPostComment(${post.id})" class="cta-button" style="padding:8px 15px; margin-left:10px;">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function createPost(event) {
    event.preventDefault();

    const mediaType = document.getElementById('postMediaType').value;
    const mediaUrl = document.getElementById('postMediaUrl').value;
    const caption = document.getElementById('postCaption').value;
    const isContentCreator = currentUser.is_content_creator || 0;

    try {
        const res = await fetch(`${API_BASE_URL}/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                username: currentUser.username,
                mediaUrl,
                mediaType,
                caption,
                isContentCreator
            })
        });

        const data = await res.json();

        if (res.ok) {
            alert('✅ Post criado com sucesso!');
            closeCreatePostModal();
            // Recarrega o feed
            loadDashContent('promo');
        } else {
            alert('❌ ' + data.message);
        }
    } catch (e) {
        console.error("Erro ao criar post:", e);
        alert('❌ Erro ao criar post');
    }
}

function openCreatePostModal() {
    const modal = document.getElementById('createPostModal');
    modal.style.display = 'flex';

    // Setup Drag and Drop
    const dropZone = modal.querySelector('.create-post-modal-content');
    setupDragAndDrop(dropZone);
}

function closeCreatePostModal() {
    document.getElementById('createPostModal').style.display = 'none';
}

// --- DRAG AND DROP LOGIC ---

function setupDragAndDrop(dropZone) {
    // Previne comportamento padrão
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Highlight
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragging'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragging'), false);
    });

    // Handle Drop
    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length > 0) {
            handleFileUploadStream(files[0]);
        }
    }
}

async function handleFileUpload_Old(file) {
    // Validação básica
    if (!file.type.startsWith('image/')) {
        alert('Apenas imagens são permitidas para upload direto.');
        return;
    }

    // Mostra status
    const urlInput = document.getElementById('postMediaUrl');
    const originalPlaceholder = urlInput.placeholder;
    urlInput.value = '';
    urlInput.placeholder = 'Fazendo upload... ⏳';
    urlInput.disabled = true;

    try {
        // Converte para Base64
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onloadend = async () => {
            const base64data = reader.result;

            // Envia para o servidor
            const res = await fetch(`${API_BASE_URL}/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64data })
            });

            const data = await res.json();

            if (res.ok) {
                // Preenche o input com a URL gerada
                urlInput.value = window.location.origin + data.url;
                alert('✅ Imagem importada com sucesso!');
            } else {
                alert('Erro no upload: ' + data.message);
                urlInput.placeholder = originalPlaceholder;
            }
            urlInput.disabled = false;
        };

    } catch (e) {
        console.error("Erro no upload:", e);
        alert('Erro ao processar arquivo.');
        urlInput.disabled = false;
        urlInput.placeholder = originalPlaceholder;
    }
}

async function toggleLike(postId) {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });

        const data = await res.json();

        if (res.ok) {
            const likeBtn = document.getElementById(`like-btn-${postId}`);
            const likeCount = document.getElementById(`like-count-${postId}`);

            if (data.liked) {
                likeBtn.classList.add('liked');
                likeCount.textContent = parseInt(likeCount.textContent) + 1;
            } else {
                likeBtn.classList.remove('liked');
                likeCount.textContent = parseInt(likeCount.textContent) - 1;
            }
        }
    } catch (e) {
        console.error("Erro ao curtir:", e);
    }
}

async function handleFileUpload(file) {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    // Validação básica
    if (!isImage && !isVideo) {
        alert('Apenas imagens ou vídeos são permitidos.');
        return;
    }

    if (isVideo && (!currentUser.is_content_creator)) {
        alert('Apenas Criadores de Conteúdo podem enviar vídeos.');
        return;
    }

    // Auto-seleciona o tipo de mídia
    const typeSelect = document.getElementById('postMediaType');
    if (isVideo) {
        // Verifica se a opção de vídeo existe (pode estar oculta para user normal)
        const videoOption = Array.from(typeSelect.options).find(o => o.value === 'video');
        if (videoOption) {
            typeSelect.value = 'video';
        }
    } else {
        typeSelect.value = 'image';
    }

    // Mostra status
    const urlInput = document.getElementById('postMediaUrl');
    const originalPlaceholder = urlInput.placeholder;
    urlInput.value = '';
    urlInput.placeholder = 'Fazendo upload... ⏳';
    urlInput.disabled = true;

    try {
        // Converte para Base64
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onloadend = async () => {
            const base64data = reader.result;

            // Envia para o servidor
            const res = await fetch(`${API_BASE_URL}/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64data })
            });

            const data = await res.json();

            if (res.ok) {
                // Preenche o input com a URL gerada
                urlInput.value = window.location.origin + data.url;
                alert(`✅ ${isVideo ? 'Vídeo' : 'Imagem'} importada com sucesso!`);
            } else {
                alert('Erro no upload: ' + data.message);
                urlInput.placeholder = originalPlaceholder;
            }
            urlInput.disabled = false;
        };

    } catch (e) {
        console.error("Erro no upload:", e);
        alert('Erro ao processar arquivo.');
        urlInput.disabled = false;
        urlInput.placeholder = originalPlaceholder;
    }
}

async function togglePostComments(postId) {
    const commentsDiv = document.getElementById(`comments-${postId}`);

    if (commentsDiv.style.display === 'none') {
        commentsDiv.style.display = 'block';
        await loadPostComments(postId);
    } else {
        commentsDiv.style.display = 'none';
    }
}

async function loadPostComments(postId) {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments`);
        const data = await res.json();

        const commentsList = document.getElementById(`comments-list-${postId}`);

        if (data.comments && data.comments.length > 0) {
            commentsList.innerHTML = data.comments.map(c => `
                <div class="comment-item">
                    <strong>${c.username}</strong>
                    <span style="color:#888; font-size:0.75rem; margin-left:10px;">${formatTimeAgo(c.created_at)}</span>
                    <p>${c.message}</p>
                </div>
            `).join('');
        } else {
            commentsList.innerHTML = '<p style="text-align:center; color:#888;">Nenhum comentário ainda.</p>';
        }
    } catch (e) {
        console.error("Erro ao carregar comentários:", e);
    }
}

async function addPostComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const message = input.value.trim();

    if (!message) return;

    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                username: currentUser.username,
                message
            })
        });

        if (res.ok) {
            input.value = '';
            await loadPostComments(postId);

            // Atualiza contador
            const post = postsData.find(p => p.id === postId);
            if (post) {
                post.comments_count = (post.comments_count || 0) + 1;
                const commentBtn = document.querySelector(`#post-${postId} .comment-btn span`);
                if (commentBtn) commentBtn.textContent = post.comments_count;
            }
        }
    } catch (e) {
        console.error("Erro ao adicionar comentário:", e);
    }
}

async function deletePost(postId) {
    if (!confirm('Tem certeza que deseja deletar este post?')) return;

    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                role: currentUser.role
            })
        });

        if (res.ok) {
            alert('✅ Post deletado com sucesso!');
            loadDashContent('promo');
        } else {
            const data = await res.json();
            alert('❌ ' + data.message);
        }
    } catch (e) {
        console.error("Erro ao deletar post:", e);
    }
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Agora';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m atrás`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h atrás`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d atrás`;

    return date.toLocaleDateString('pt-BR');
}

// Função OTIMIZADA para upload de grandes arquivos (Binary Stream)
async function handleFileUploadStream(file) {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    // Validação básica
    if (!isImage && !isVideo) {
        alert('Apenas imagens ou vídeos são permitidos.');
        return;
    }

    if (isVideo && (!currentUser.is_content_creator)) {
        alert('Apenas Criadores de Conteúdo podem enviar vídeos.');
        return;
    }

    // Auto-seleciona o tipo de mídia
    const typeSelect = document.getElementById('postMediaType');
    if (isVideo) {
        const videoOption = Array.from(typeSelect.options).find(o => o.value === 'video');
        if (videoOption) {
            typeSelect.value = 'video';
        }
    } else {
        typeSelect.value = 'image';
    }

    // Mostra status
    const urlInput = document.getElementById('postMediaUrl');
    const originalPlaceholder = urlInput.placeholder;
    urlInput.value = '';
    urlInput.placeholder = 'Fazendo upload (Stream)... ⏳';
    urlInput.disabled = true;

    try {
        // Envia o arquivo como blob/stream direto
        const res = await fetch(`${API_BASE_URL}/upload`, {
            method: 'POST',
            headers: {
                'x-filename': file.name,
                'x-user-id': currentUser.id.toString()
                // Content-Type e Content-Length são geridos pelo browser
            },
            body: file
        });

        const data = await res.json();

        if (res.ok) {
            urlInput.value = window.location.origin + data.url;
            alert(`✅ ${isVideo ? 'Vídeo' : 'Imagem'} enviada com sucesso!`);
        } else {
            alert('Erro no upload: ' + (data.message || res.statusText));
            urlInput.placeholder = originalPlaceholder;
        }

    } catch (e) {
        console.error("Erro no upload:", e);
        alert('Erro ao processar arquivo.');
        urlInput.placeholder = originalPlaceholder;
    } finally {
        urlInput.disabled = false;
    }
}

/* --- COMMUNITY TABS LOGIC --- */
function switchCommunityTab(tab) {
    // Buttons
    document.querySelectorAll('.subtab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');

    // Containers
    const feed = document.getElementById('feedContainer');
    const chat = document.getElementById('chatContainer');

    if (feed && chat) {
        if (tab === 'feed') {
            feed.style.display = 'block';
            chat.style.display = 'none';
        } else {
            feed.style.display = 'none';
            chat.style.display = 'flex'; // Changed to flex for chat layout

            // Inicializa chat se necessário
            initChat();

            // Auto-scroll para o fim
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }
}

/* --- GLOBAL CHAT FUNCTIONS --- */

function initChat() {
    if (socket) return; // Já conectado

    // Conecta ao namespace raiz (o mesmo do server)
    socket = io(API_BASE_URL || undefined); // Se vazio o IO tenta conectar no host atual, se tiver url conecta lá

    // Entra na sala com nome de usuário
    if (currentUser && currentUser.username) {
        socket.emit('join', currentUser.username);
    }

    // Recebe histórico de mensagens ao conectar
    socket.on('chatHistory', (messages) => {
        const chatMessages = document.getElementById('chatMessages');
        // Limpa mensagens atuais (exceto a de boas-vindas do sistema se quiser manter, mas melhor limpar tudo para evitar duplicatas visuais em reconexão)
        // Mantemos a div de boas vindas 'message-system' se ela existir no HTML estático?
        // O HTML tem: <div class="message message-system">Bem-vindo ao Chat Global!</div>
        // Vamos manter a de boas vindas e adicionar o histórico depois.

        // Remove mensagens anteriores que não sejam de sistema (opcional, ou limpa tudo)
        // chatMessages.innerHTML = '<div class="message message-system">Bem-vindo ao Chat Global!</div>'; 

        messages.forEach(msg => {
            appendMessage(msg);
        });
    });

    // Recebe mensagens novas
    socket.on('chatMessage', (data) => {
        appendMessage(data);
    });
}

function sendChatMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input.value.trim();

    if (!text) return;
    if (!socket) return;
    if (!currentUser) return; // Precisa estar logado

    const messageData = {
        username: currentUser.username,
        message: text,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    // Envia para o servidor
    socket.emit('chatMessage', messageData);

    // Limpa input
    input.value = '';
}

function appendMessage(data) {
    const chatMessages = document.getElementById('chatMessages');
    const isMine = currentUser && data.username === currentUser.username;

    const div = document.createElement('div');
    div.classList.add('message');
    div.classList.add(isMine ? 'message-mine' : 'message-other');

    div.innerHTML = `
        <div class="message-header">${data.username} • ${data.timestamp || ''}</div>
        ${escapeHtml(data.message)}
    `;

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll
}

function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- DEVELOPER DOCS & AI FUNCTIONS ---

// --- API DOCS DATA & HELPERS ---
const apiDocsData = [
    // AUTHENTICATION
    {
        category: 'Autenticação (Client)',
        endpoints: [
            {
                method: 'POST', path: '/auth/login', desc: 'Realiza login do cliente na aplicação.',
                body: { app_id: 'SEU_APP_ID', key: 'USER_LICENSE_KEY', hwid: 'USER_HWID' }
            },
            {
                method: 'POST', path: '/auth/init', desc: 'Inicializa a handshake/sessão segura.',
                body: { app_id: 'SEU_APP_ID', session_id: 'SESSION_ID', enc_key: 'ENCRYPTED_KEY' }
            },
            {
                method: 'POST', path: '/auth/license', desc: 'Ativa/Resgata uma licença.',
                body: { app_id: 'SEU_APP_ID', key: 'NEW_KEY', hwid: 'USER_HWID' }
            },
            {
                method: 'POST', path: '/auth/hwid', desc: 'Registra ou valida HWID.',
                body: { app_id: 'SEU_APP_ID', user_id: 'USER_ID', hwid: 'NEW_HWID' }
            },
            {
                method: 'POST', path: '/auth/log-login', desc: 'Registra log de login.',
                body: { app_id: 'SEU_APP_ID', user_id: 'USER_ID', ip: 'USER_IP', action: 'login' }
            }
        ]
    },
    // APP MANAGEMENT
    {
        category: 'Gestão de Aplicações',
        endpoints: [
            {
                method: 'POST', path: '/api/app/create', desc: 'Cria uma nova aplicação (Partners).',
                body: { userId: 'YOUR_USER_ID', name: 'New App Name' }
            },
            {
                method: 'GET', path: '/api/app/:appId/stats', desc: 'Retorna estatísticas da app.',
                params: { appId: 'APP_ID' }
            },
            {
                method: 'GET', path: '/api/app/:appId/keys', desc: 'Lista todas as chaves.',
                params: { appId: 'APP_ID' }
            },
            {
                method: 'POST', path: '/api/app/:appId/keys/generate', desc: 'Gera chaves em lote.',
                body: { userId: 'YOUR_USER_ID', count: 10, days: 30, level: 1 }
            },
            {
                method: 'DELETE', path: '/api/app/:appId/keys/:keyId', desc: 'Deleta uma chave específica.',
                body: { userId: 'YOUR_USER_ID' }
            },
            {
                method: 'POST', path: '/api/app/:appId/blacklist', desc: 'Adiciona usuário à blacklist.',
                body: { userId: 'YOUR_USER_ID', targetUser: 'TARGET_USERNAME', reason: 'Abuse' }
            }
        ]
    },
    // GENERAL
    {
        category: 'Geral',
        endpoints: [
            {
                method: 'GET', path: '/products', desc: 'Retorna lista de produtos da loja.',
                params: {}
            },
            {
                method: 'GET', path: '/posts', desc: 'Feed de notícias/posts.',
                params: {}
            },
            {
                method: 'GET', path: '/api/check-user', desc: 'Verifica existência de usuário.',
                params: { username: 'USER_TESTE' }
            }
        ]
    }
];

// Helper to generate snippet based on language and endpoint data
function getApiSnippet(lang, ep) {
    const baseUrl = API_BASE_URL || window.location.origin;
    const url = `${baseUrl}${ep.path}`;

    if (lang === 'javascript') {
        if (ep.method === 'GET') {
            const query = ep.params ? '?' + new URLSearchParams(ep.params).toString() : '';
            return `fetch('${url}${query}', {
    method: 'GET',
    headers: { 'x-dev-token': '${currentUser.dev_token}' }
}).then(res => res.json()).then(console.log);`;
        } else {
            return `fetch('${url}', {
    method: '${ep.method}',
    headers: { 
        'Content-Type': 'application/json',
        'x-dev-token': '${currentUser.dev_token}'
    },
    body: JSON.stringify(${JSON.stringify(ep.body, null, 4)})
}).then(res => res.json()).then(console.log);`;
        }
    }

    if (lang === 'python') {
        if (ep.method === 'GET') {
            return `import requests
url = '${url}'
headers = {'x-dev-token': '${currentUser.dev_token}'}
params = ${JSON.stringify(ep.params || {})}
r = requests.get(url, headers=headers, params=params)
print(r.json())`;
        } else {
            return `import requests
url = '${url}'
headers = {'x-dev-token': '${currentUser.dev_token}'}
data = ${JSON.stringify(ep.body || {})}
r = requests.${ep.method.toLowerCase()}(url, headers=headers, json=data)
print(r.json())`;
        }
    }

    if (lang === 'csharp') {
        if (ep.method === 'GET') {
            return `using System.Net.Http;
var client = new HttpClient();
client.DefaultRequestHeaders.Add("x-dev-token", "${currentUser.dev_token}");
var response = await client.GetAsync("${url}");
var content = await response.Content.ReadAsStringAsync();
Console.WriteLine(content);`;
        } else {
            return `using System.Net.Http;
using System.Text;
using System.Text.Json;

var client = new HttpClient();
client.DefaultRequestHeaders.Add("x-dev-token", "${currentUser.dev_token}");
var json = JsonSerializer.Serialize(new ${JSON.stringify(ep.body).replace(/{|}/g, '').replace(/"/g, '') /* Simple mock convert */});
// Note: Fix C# serialization object manually
var content = new StringContent("${JSON.stringify(ep.body).replace(/"/g, '\\"')}", Encoding.UTF8, "application/json");
var response = await client.${ep.method === 'POST' ? 'PostAsync' : 'PutAsync'}("${url}", content);
var result = await response.Content.ReadAsStringAsync();
Console.WriteLine(result);`;
        }
    }

    if (lang === 'cpp') {
        return `// Requires CPR Library
#include <cpr/cpr.h>
#include <iostream>

int main() {
    cpr::Response r = cpr::${ep.method === 'GET' ? 'Get' : 'Post'}(cpr::Url{"${url}"},
                      cpr::Header{{"x-dev-token", "${currentUser.dev_token}"}}${ep.method !== 'GET' ? `,
                      cpr::Body{"${JSON.stringify(ep.body).replace(/"/g, '\\"')}"},
                      cpr::Header{{"Content-Type", "application/json"}}` : ''});
    std::cout << r.text << std::endl;
    return 0;
}`;
    }

    return `// Language ${lang} not implemented for this snippet yet.`;
}

function toggleApiDetail(id) {
    const detail = document.getElementById(`api-detail-${id}`);
    const icon = document.getElementById(`api-icon-${id}`);
    if (detail.style.display === 'none') {
        detail.style.display = 'block';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
        // Trigger highlight when shown
        const codeEl = document.getElementById(`code-${id}`);
        if (codeEl) Prism.highlightElement(codeEl);
    } else {
        detail.style.display = 'none';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    }
}

function switchApiItemLang(id, lang, method, path, bodyStr, paramsStr) {
    const [catIdx, epIdx] = id.split('-').map(Number);
    const ep = apiDocsData[catIdx].endpoints[epIdx];

    const snippet = getApiSnippet(lang, ep);
    const codeEl = document.getElementById(`code-${id}`);

    // Update text and class
    codeEl.textContent = snippet;
    const prismLang = lang === 'csharp' ? 'csharp' : (lang === 'cpp' ? 'cpp' : (lang === 'python' ? 'python' : 'javascript'));
    codeEl.className = `language-${prismLang}`;

    Prism.highlightElement(codeEl);

    // Update active tab
    document.querySelectorAll(`.lang-btn-${id}`).forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${id}-${lang}`).classList.add('active');
}

function renderDevDocs(container) {
    container.innerHTML = `
        <h2><i class="fa-solid fa-code"></i> Documentação para Desenvolvedores</h2>
        
        <!-- TOKEN SECTION -->
         <div class="status-box" style="border-left-color: #ff1e1e;">
            <h3>Seu Token de Desenvolvedor</h3>
            <p style="color:#888; font-size:0.9rem;">Token secreto. Não compartilhe.</p>
            <div class="input-group" style="margin-top:10px;">
                <input type="text" value="${currentUser.dev_token || 'Nenhum token gerado'}" readonly style="text-align:center; letter-spacing:1px; font-family:monospace; color:#ff1e1e; width: 100%; background: #222; border: 1px solid #444; padding: 10px;">
            </div>
        </div>

        <!-- API LIST -->
        <div class="api-list-section" style="margin-top:30px;">
            <h3><i class="fa-solid fa-book"></i> Endpoints Disponíveis</h3>
            <p style="color:#888; margin-bottom:20px; font-size:0.9rem;">Clique nos itens para ver exemplos de integração.</p>
            
            ${apiDocsData.map((cat, catIdx) => `
                <div class="api-group" style="margin-bottom:30px;">
                    <h4 style="color:#fff; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:5px;">${cat.category}</h4>
                    ${cat.endpoints.map((ep, epIdx) => {
        const id = `${catIdx}-${epIdx}`;
        const methodColors = { 'POST': '#4caf50', 'GET': '#2196f3', 'DELETE': '#f44336', 'PUT': '#ff9800' };
        const color = methodColors[ep.method] || '#777';
        const defaultSnippet = getApiSnippet('javascript', ep);

        return `
                        <div class="api-item-box" style="margin-bottom:10px; border:1px solid #333; border-radius:6px; overflow:hidden;">
                            <!-- Header -->
                            <div class="api-item-header" onclick="toggleApiDetail('${id}')" 
                                 style="background:#1a1a1a; padding:15px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; transition:background 0.2s;">
                                <div style="display:flex; align-items:center; gap:15px;">
                                    <span style="background:${color}; color:#fff; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:0.75rem; min-width:60px; text-align:center;">${ep.method}</span>
                                    <code style="color:#fff; font-size:0.95rem; font-family:'JetBrains Mono', monospace;">${ep.path}</code>
                                </div>
                                <div style="display:flex; align-items:center; gap:15px;">
                                    <span style="color:#888; font-size:0.85rem;">${ep.desc}</span>
                                    <i id="api-icon-${id}" class="fa-solid fa-chevron-down" style="color:#666;"></i>
                                </div>
                            </div>
                            
                            <!-- Detailed Body (Hidden) -->
                            <div id="api-detail-${id}" style="display:none; background:#111; border-top:1px solid #333;">
                                <div style="padding:15px;">
                                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                                        ${['javascript', 'python', 'csharp', 'cpp'].map(lang => `
                                            <button id="btn-${id}-${lang}" class="subtab-btn lang-btn-${id} ${lang === 'javascript' ? 'active' : ''}" 
                                                onclick="switchApiItemLang('${id}', '${lang}')"
                                                style="padding:4px 12px; font-size:0.8rem;">
                                                ${lang.toUpperCase()}
                                            </button>
                                        `).join('')}
                                    </div>
                                    <div style="position:relative; background:#0d0d0d; border-radius:6px; border:1px solid #333;">
                                         <button onclick="navigator.clipboard.writeText(document.getElementById('code-${id}').textContent).then(()=>alert('Copiado!'))" 
                                                 style="position:absolute; top:10px; right:10px; background:transparent; border:none; color:#aaa; cursor:pointer;">
                                            <i class="fa-regular fa-copy"></i>
                                         </button>
                                         <pre style="margin:0; padding:15px; border-radius:6px; overflow:auto;"><code id="code-${id}" class="language-javascript" style="font-family:'JetBrains Mono', monospace; font-size:0.85rem;">${defaultSnippet}</code></pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                        `;
    }).join('')}
                </div>
            `).join('')}
        </div>

        <!-- DOCS BUTTON (Github Style) -->
        <div style="margin-top:50px; text-align:center; padding-bottom:30px;">
            <a href="#" onclick="alert('Documentação externa em breve!'); return false;" class="github-docs-btn" 
               style="display:inline-flex; align-items:center; gap:10px; background:#24292e; color:white; padding:12px 25px; border-radius:6px; text-decoration:none; font-weight:600; border:1px solid #444; transition:all 0.2s;">
                <i class="fa-brands fa-github" style="font-size:1.2rem;"></i>
                <span>Ver Documentação Completa</span>
            </a>
            <p style="color:#666; font-size:0.8rem; margin-top:10px;">Consulte a wiki para detalhes de implementação.</p>
        </div>
    `;

    // Scroll chat to bottom (if exists)
    const chatBox = document.getElementById('aiChatBox');
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
}

function switchDocLang(lang) {
    currentDocLang = lang;
    const container = document.getElementById('dashDynamicContent');
    renderDevDocs(container);
}

function copyCodeSnippet() {
    const code = document.getElementById('codeSnippetDisplay').innerText;
    navigator.clipboard.writeText(code).then(() => {
        alert("Código copiado!");
    });
}

async function handleAiChatSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('aiChatInput');
    const text = input.value.trim();
    if (!text) return;

    // Add User Message
    devChatMessages.push({ role: 'user', text });

    // Clear input immediately
    input.value = '';

    // Show "Thinking..." state (Temporary message)
    const thinkingId = Date.now();
    devChatMessages.push({ role: 'assistant', text: '<i class="fa-solid fa-circle-notch fa-spin"></i> Pesquisando...', id: thinkingId });
    renderDevDocs(document.getElementById('dashDynamicContent'));

    try {
        const res = await fetch(`${API_BASE_URL}/api/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                userId: currentUser ? currentUser.id : null
            })
        });

        const data = await res.json();

        // Remove "Thinking" message
        devChatMessages = devChatMessages.filter(m => m.id !== thinkingId);

        // Add AI Response
        devChatMessages.push({ role: 'assistant', text: data.response || "Desculpe, não consegui processar sua solicitação." });

    } catch (err) {
        console.error(err);
        devChatMessages = devChatMessages.filter(m => m.id !== thinkingId);
        devChatMessages.push({ role: 'assistant', text: "Erro de conexão com o cérebro da IA." });
    }

    // Re-render chat
    const container = document.getElementById('dashDynamicContent');
    renderDevDocs(container);

    // Focus input again
    setTimeout(() => {
        const inputEl = document.getElementById('aiChatInput');
        if (inputEl) inputEl.focus();
    }, 100);
}

// --- SETTINGS & CONFIGURATION LOGIC ---

let currentSettingsTab = 'profile';

async function renderSettings(container) {
    container.innerHTML = `
        <h2><i class="fa-solid fa-gear"></i> Configurações</h2>
        
        <div class="settings-tabs">
            <button class="settings-tab-btn ${currentSettingsTab === 'profile' ? 'active' : ''}" onclick="switchSettingsTab('profile')">Perfil</button>
            <button class="settings-tab-btn ${currentSettingsTab === 'appearance' ? 'active' : ''}" onclick="switchSettingsTab('appearance')">Aparência</button>
            <button class="settings-tab-btn ${currentSettingsTab === 'support' ? 'active' : ''}" onclick="switchSettingsTab('support')">Suporte & Segurança</button>
        </div>

        <div id="settingsContent"></div>
    `;
    renderSettingsContent();
}

function switchSettingsTab(tab) {
    currentSettingsTab = tab;
    // Update active class
    document.querySelectorAll('.settings-tab-btn').forEach(btn => btn.classList.remove('active'));
    // Find button by text (simple way) or re-render
    renderSettings(document.getElementById('dashDynamicContent'));
}

async function renderSettingsContent() {
    const content = document.getElementById('settingsContent');
    if (!content) return;

    if (currentSettingsTab === 'profile') {
        const pic = (currentUser.profile_pic && currentUser.profile_pic.length > 50) ? currentUser.profile_pic : 'https://i.imgur.com/user_placeholder.png';
        content.innerHTML = `
            <div class="status-box" style="border-left-color: var(--primary-color);">
                <h3><i class="fa-solid fa-address-card"></i> Dados Pessoais</h3>
                
                <div class="profile-pic-container">
                    <img id="profilePreview" src="${pic}" alt="Profile">
                    <label for="profileUpload" class="profile-overlay"><i class="fa-solid fa-camera"></i> ALTERAR</label>
                    <input type="file" id="profileUpload" accept="image/*" style="display:none;" onchange="handleProfileUploadLocal(this)">
                </div>

                <div>
                    <label style="color:var(--text-muted); display:block; margin-bottom:5px;">Nome de Usuário</label>
                    <div class="input-group" style="margin-top:0;">
                        <i class="fa-solid fa-user"></i>
                        <input type="text" value="${currentUser.username}" disabled style="opacity:0.7">
                    </div>
                </div>
                <div>
                    <label style="color:var(--text-muted); display:block; margin-bottom:5px;">Email</label>
                    <div class="input-group" style="margin-top:0;">
                        <i class="fa-solid fa-envelope"></i>
                        <input type="text" value="${currentUser.email}" disabled style="opacity:0.7">
                    </div>
                </div>

                 <h4 style="margin-top:20px; color:var(--text-muted);"><i class="fa-solid fa-shield-halved"></i> Alterar Credenciais</h4>
                 <div class="input-group">
                    <i class="fa-solid fa-envelope"></i>
                    <input type="email" id="updateEmail" placeholder="Novo Email">
                </div>
                 <div class="input-group">
                    <i class="fa-solid fa-lock"></i>
                    <input type="password" id="updatePass" placeholder="Nova Senha">
                </div>
                <button class="cta-button" onclick="updateProfile()" style="width:100%; margin-top:10px;">SALVAR ALTERAÇÕES</button>
                <p id="updateMsg" style="margin-top:10px; text-align:center;"></p>
            </div>

            <!-- Discord Section -->
            <div style="margin-top:20px; padding:15px; background: rgba(88, 101, 242, 0.1); border-radius:8px; border: 1px solid rgba(88, 101, 242, 0.3);">
                <h4 style="color:#5865F2; margin-bottom:10px;"><i class="fa-brands fa-discord"></i> Integração Discord</h4>
                ${currentUser.discord_id ? `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <p style="color:white; font-size:0.9rem;">Vinculado como: <strong>${currentUser.discord_username || 'Usuário'}</strong></p>
                        </div>
                        <button class="btn-outline" onclick="unlinkDiscord()" style="border-color:#ff4444; color:#ff4444; font-size:0.8rem; padding: 5px 10px;">Desvincular</button>
                    </div>
                    <div style="margin-top:10px; display:flex; align-items:center; gap:10px;">
                        <label class="switch">
                            <input type="checkbox" ${currentUser.use_discord_avatar ? 'checked' : ''} onchange="toggleDiscordAvatar(this.checked)">
                            <span class="slider"></span>
                        </label>
                        <span style="font-size:0.85rem; color:#ccc;">Usar foto de perfil do Discord</span>
                    </div>
                ` : `
                    <p style="color:#ccc; font-size:0.85rem; margin-bottom:10px;">Vincule sua conta para sincronizar foto e desbloquear benefícios.</p>
                    <button class="cta-button" onclick="linkDiscord()" style="background:#5865F2; width:100%;"><i class="fa-brands fa-discord"></i> VINCULAR DISCORD</button>
                `}
            </div>
        `;
        // const isDark = config.darkMode !== false; 
        // "config" was undefined. Removed unused logic for this block as isDark is calculated in Appearance tab.
        // Fim do bloco Profile
    } else if (currentSettingsTab === 'appearance') {
        const isDark = (currentUser.theme_config && JSON.parse(currentUser.theme_config).darkMode === false) ? false : true;
        const currentPrimary = (currentUser.theme_config && JSON.parse(currentUser.theme_config).primaryColor) ? JSON.parse(currentUser.theme_config).primaryColor : '#ff0000';

        content.innerHTML = `
            <div class="status-box" style="border-left-color: #00bcd4;">
                <h3><i class="fa-solid fa-paintbrush"></i> Personalização</h3>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <span><i class="fa-solid fa-moon" style="margin-right:8px;"></i> Modo Escuro</span>
                    <label class="switch">
                        <input type="checkbox" id="darkModeToggle" ${isDark ? 'checked' : ''} onchange="saveThemeSettings()">
                        <span class="slider"></span>
                    </label>
                </div>

                <div class="input-group">
                    <label style="display:block; margin-bottom:10px;"><i class="fa-solid fa-palette" style="margin-right:8px;"></i> Cor Principal (Tema)</label>
                    <input type="color" id="primaryColorPick" value="${currentPrimary}" style="width:100%; height:40px; border:none; padding:0;" onchange="saveThemeSettings()">
                </div>
                
                 <div style="border-top:1px solid var(--border-color); margin: 20px 0;"></div>

                <h3><i class="fa-solid fa-wand-magic-sparkles"></i> Design Mode</h3>
                <p style="font-size:0.8rem; color:var(--text-muted);">Ative para ocultar/reorganizar elementos na dashboard.</p>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                    <span><i class="fa-solid fa-eye" style="margin-right:8px;"></i> Ativar Design Mode</span>
                    <label class="switch">
                        <input type="checkbox" id="designModeToggle" onchange="toggleDesignMode(this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        `;
    } else if (currentSettingsTab === 'support') {
        content.innerHTML = `
            <div class="status-box" style="border-left-color: #ff9800;">
                <h3>Solicitar Reset de HWID</h3>
                <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:15px;">Use apenas se trocou de computador ou peças.</p>
                <form onsubmit="handleHwidReset(event)">
                    <div class="input-group">
                        <label>Produto</label>
                        <select id="hwidProduct" style="width:100%; padding:10px; background:#222; color:#fff; border:1px solid var(--border-color);">
                            <option value="all" selected>Todos (Todas as licenças)</option>
                            ${productsData.filter(p => p.hasLicense).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Motivo</label>
                        <input type="text" id="hwidReason" required placeholder="Ex: Troquei de placa mãe">
                    </div>
                    <button type="submit" class="cta-button" style="background:#ff9800;">SOLICITAR RESET</button>
                </form>
            </div>

            <div class="status-box" style="border-left-color: #2196f3;">
                <h3>Abrir Ticket de Suporte</h3>
                <form onsubmit="handleTicketSubmit(event)">
                    <div class="input-group">
                        <label>Assunto</label>
                         <select id="ticketSubject" style="width:100%; padding:10px; background:#222; color:#fff; border:1px solid var(--border-color);">
                            <option value="Dúvida">Dúvida Técnica</option>
                            <option value="Pagamento">Problema com Pagamento</option>
                            <option value="Bug">Reportar Bug</option>
                            <option value="Outro">Outro</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Mensagem</label>
                        <textarea id="ticketMessage" rows="4" required placeholder="Descreva seu problema..." style="width:100%; background:#222; color:#fff; border:1px solid var(--border-color);"></textarea>
                    </div>
                    <button type="submit" class="cta-button" style="background:#2196f3;">ENVIAR TICKET</button>
                </form>
            </div>
            
            <div id="myTicketsList">
                <!-- Load tickets here -->
            </div>
        `;
        loadUserTickets();
    }
}

async function handleProfileUploadLocal(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];

        // Validate file type
        if (!file.type.startsWith('image/')) {
            showNotify('error', 'Por favor, selecione uma imagem válida.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async function (e) {
            const originalBase64 = e.target.result;

            // Check original size
            const originalSizeBytes = (originalBase64.length * 3) / 4;
            const originalSizeMB = originalSizeBytes / (1024 * 1024);

            console.log(`Imagem original: ${originalSizeMB.toFixed(2)} MB`);

            // Compress if needed (target: under 800KB for Firestore)
            const maxSizeMB = 0.8; // 800KB

            if (originalSizeMB > maxSizeMB) {
                showNotify('info', 'Comprimindo imagem...');

                try {
                    const compressedBase64 = await compressImage(originalBase64, maxSizeMB);
                    const compressedSizeMB = (compressedBase64.length * 3 / 4) / (1024 * 1024);
                    console.log(`Imagem comprimida: ${compressedSizeMB.toFixed(2)} MB`);

                    if (compressedSizeMB > 0.9) {
                        showNotify('error', 'Imagem muito grande mesmo após compressão. Use uma imagem menor.');
                        return;
                    }

                    document.getElementById('profilePreview').src = compressedBase64;
                    pendingProfilePic = compressedBase64;
                    showNotify('success', `Imagem otimizada! (${compressedSizeMB.toFixed(2)} MB)`);
                } catch (error) {
                    console.error('Erro ao comprimir:', error);
                    showNotify('error', 'Erro ao processar imagem. Tente uma imagem menor.');
                }
            } else {
                // Image already small enough
                document.getElementById('profilePreview').src = originalBase64;
                pendingProfilePic = originalBase64;
                showNotify('success', 'Imagem carregada!');
            }
        };
        reader.readAsDataURL(file);
    }
}

// Helper function to compress image
function compressImage(base64, maxSizeMB) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Calculate new dimensions (maintain aspect ratio)
            let width = img.width;
            let height = img.height;
            const maxDimension = 800; // Maximum width/height

            if (width > height) {
                if (width > maxDimension) {
                    height *= maxDimension / width;
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width *= maxDimension / height;
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;

            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);

            // Try different quality levels until we get under maxSizeMB
            let quality = 0.7;
            let result = canvas.toDataURL('image/jpeg', quality);

            while ((result.length * 3 / 4) / (1024 * 1024) > maxSizeMB && quality > 0.1) {
                quality -= 0.1;
                result = canvas.toDataURL('image/jpeg', quality);
            }

            resolve(result);
        };
        img.onerror = reject;
        img.src = base64;
    });
}

async function saveThemeSettings() {
    const darkMode = document.getElementById('darkModeToggle').checked;
    const primaryColor = document.getElementById('primaryColorPick').value;

    const config = {
        darkMode: darkMode,
        primaryColor: primaryColor
    };

    // Apply instantly
    applyTheme(config);

    // Save
    try {
        const res = await fetch('/user/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                themeConfig: JSON.stringify(config)
            })
        });
        if (res.ok) {
            currentUser.theme_config = JSON.stringify(config);
            localStorage.setItem('scarlet_user', JSON.stringify(currentUser));
            showNotify('success', 'Tema salvo!');
        }
    } catch (err) {
        console.error(err);
    }
}

// Design Mode
function toggleDesignMode(active) {
    const dashboard = document.getElementById('dashboardSection');
    if (active) {
        dashboard.classList.add('design-mode-on');
        dashboard.classList.add('design-active');
        enableDesignEdit(true);
        showNotify('info', 'Design Mode Ativo. Clique nos olhos para ocultar/mostrar.');
    } else {
        dashboard.classList.remove('design-mode-on');
        dashboard.classList.remove('design-active');
        enableDesignEdit(false);
    }
}

function enableDesignEdit(enable) {
    // Add toggle buttons to all status-boxes and products if not present
    const elements = document.querySelectorAll('.status-box, .product-card, .sidebar');
    elements.forEach(el => {
        if (enable) {
            if (!el.querySelector('.design-toggle-btn')) {
                const btn = document.createElement('div');
                btn.className = 'design-toggle-btn';
                btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
                btn.onclick = (e) => {
                    e.stopPropagation(); // prevent other clicks
                    el.classList.toggle('hidden-element');
                };
                el.style.position = 'relative';
                el.appendChild(btn);
            }
        } else {
            const btn = el.querySelector('.design-toggle-btn');
            if (btn) btn.remove();
        }
    });
}

// HWID & Tickets
async function handleHwidReset(e) {
    e.preventDefault();
    const productId = document.getElementById('hwidProduct').value;
    const reason = document.getElementById('hwidReason').value;

    try {
        const res = await fetch(`${API_BASE_URL}/hwid-reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, productId, reason })
        });
        if (res.ok) {
            showNotify('success', 'Solicitação enviada!');
            document.getElementById('hwidReason').value = '';
        } else {
            showNotify('error', 'Erro ao solicitar.');
        }
    } catch (err) { console.error(err); }
}

async function handleTicketSubmit(e) {
    e.preventDefault();
    const subject = document.getElementById('ticketSubject').value;
    const message = document.getElementById('ticketMessage').value;

    try {
        const res = await fetch(`${API_BASE_URL}/tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, subject, message })
        });
        if (res.ok) {
            showNotify('success', 'Ticket criado!');
            document.getElementById('ticketMessage').value = '';
            loadUserTickets();
        } else {
            showNotify('error', 'Erro ao criar ticket.');
        }
    } catch (err) { console.error(err); }
}

async function loadUserTickets() {
    try {
        const res = await fetch(`${API_BASE_URL}/tickets/${currentUser.id}`);
        const data = await res.json();
        const list = document.getElementById('myTicketsList');
        if (!list) return;

        if (data.tickets && data.tickets.length > 0) {
            list.innerHTML = `<h4 style="margin-top:20px;">Meus Tickets</h4>` + data.tickets.map(t => {
                const unreadDot = t.has_unread_user ? `<span style="display:inline-block; width:10px; height:10px; background:red; border-radius:50%; margin-right:5px;"></span>` : '';
                return `
                <div onclick="openUserTicketChat('${t.id}', '${escapeHtml(t.subject)}')" style="background:#222; padding:10px; margin-bottom:10px; border-radius:4px; border-left: 3px solid ${t.has_unread_user ? 'red' : '#777'}; cursor:pointer; transition: background 0.2s;" onmouseover="this.style.background='#2a2a2a'" onmouseout="this.style.background='#222'">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>${unreadDot}${t.subject}</strong>
                        <span style="font-size:0.8rem; color:#aaa;">${new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                    <p style="font-size:0.9rem; color:#ccc; margin-top:5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90%;">${t.message}</p>
                    <div style="display:flex; justify-content:space-between; margin-top:5px;">
                        <small style="color:${t.status !== 'Open' ? '#00ff88' : '#888'}">Status: ${t.status}</small>
                        ${t.assigned_to ? `<small style="color:#00bd9d"><i class="fa-solid fa-user-secret"></i> ${t.assigned_to}</small>` : ''}
                    </div>
                </div>
            `;
            }).join('');
        } else {
            list.innerHTML = '<p style="color:#666; margin-top:10px;">Nenhum ticket encontrado.</p>';
        }
    } catch (err) { console.error(err); }
}

let userTicketInterval = null;

function openUserTicketChat(ticketId, subject) {
    let modal = document.getElementById('userTicketModal');
    if (!modal) {
        const div = document.createElement('div');
        div.id = 'userTicketModal';
        div.className = 'modal';
        div.style.zIndex = '3500';
        div.innerHTML = `
            <div class="modal-content" style="max-width:600px; width:95%; height:80vh; display:flex; flex-direction:column;">
                <span class="close" onclick="closeUserTicketModal()">&times;</span>
                <h3 id="userTicketTitle" style="border-bottom:1px solid #333; padding-bottom:10px;">Ticket Chat</h3>
                <div id="userTicketChatBox" style="flex:1; overflow-y:auto; background:#111; padding:15px; margin:10px 0; border-radius:8px; border:1px solid #333;"></div>
                <form onsubmit="sendTicketReplyUser(event)" style="display:flex; gap:10px;">
                    <input type="text" id="userTicketInput" placeholder="Sua resposta..." autocomplete="off" style="flex:1; padding:10px; background:#222; color:white; border:1px solid #444; border-radius:4px;">
                    <button type="submit" class="cta-button" style="width:auto;"><i class="fa-solid fa-paper-plane"></i></button>
                </form>
            </div>
        `;
        document.body.appendChild(div);
        modal = div;
    }

    currentTicketId = ticketId;
    document.getElementById('userTicketTitle').innerHTML = `<i class="fa-solid fa-comments"></i> ${subject}`;
    modal.style.display = 'flex';

    // Mark as read immediately
    markTicketRead(ticketId, 'user');

    loadTicketMessagesUser(ticketId);

    // Poll for changes
    if (userTicketInterval) clearInterval(userTicketInterval);
    userTicketInterval = setInterval(() => loadTicketMessagesUser(ticketId), 5000);
}

function closeUserTicketModal() {
    const modal = document.getElementById('userTicketModal');
    if (modal) modal.style.display = 'none';
    if (userTicketInterval) clearInterval(userTicketInterval);
    loadUserTickets(); // Refresh list to clear unread
}

async function markTicketRead(id, role) {
    try {
        await fetch(`${API_BASE_URL}/tickets/${id}/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role })
        });
    } catch (e) { }
}

async function loadTicketMessagesUser(ticketId) {
    const box = document.getElementById('userTicketChatBox');
    // Don't clear box every time to avoid flicker, only if empty
    if (!box.innerHTML) box.innerHTML = '<p style="text-align:center; color:#666;">Carregando...</p>';

    try {
        const res = await fetch(`${API_BASE_URL}/tickets/${currentUser.id}`);
        const data = await res.json();
        const ticket = data.tickets.find(t => t.id === ticketId);

        if (ticket) {
            let html = `
                <div style="margin-bottom:15px; background:rgba(255,0,0,0.1); padding:10px; border-radius:8px;">
                     <strong style="color:var(--primary-color);">Ticket Original:</strong><br>
                     ${ticket.message}
                </div>
            `;

            if (ticket.messages && ticket.messages.length > 0) {
                html += ticket.messages.map(m => `
                    <div style="margin: 10px 0; text-align: ${m.sender === currentUser.username ? 'right' : 'left'};">
                        <div style="display:inline-block; padding:8px 12px; border-radius:8px; background: ${m.sender === currentUser.username ? '#0078d4' : '#333'}; color:white; max-width:80%;">
                             <small style="display:block; opacity:0.7; font-size:0.7rem;">${m.sender}</small>
                             ${m.message}
                        </div>
                    </div>
                `).join('');
            }

            box.innerHTML = html;
            // Only scroll if near bottom or first load? For now auto scroll.
            // box.scrollTop = box.scrollHeight; 
        }
    } catch (e) {
        // box.innerHTML = "Erro ao carregar mensagens.";
    }
}

async function sendTicketReplyUser(e) {
    e.preventDefault();
    const input = document.getElementById('userTicketInput');
    const message = input.value.trim();
    if (!message || !currentTicketId) return;

    try {
        const res = await fetch(`${API_BASE_URL}/tickets/${currentTicketId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                sender: currentUser.username,
                message,
                role: 'user'
            })
        });

        if (res.ok) {
            input.value = '';
            loadTicketMessagesUser(currentTicketId);
        } else {
            alert('Erro ao enviar.');
        }
    } catch (err) {
        console.error(err);
        alert('Erro de conexão');
    }
}

// --- ADMIN TICKETS ---
async function renderAdminTickets(container) {
    container.innerHTML = `<h2><i class="fa-solid fa-ticket"></i> Tickets de Suporte (Admin)</h2>
    <div id="adminTicketsContainer">
        <p>Carregando tickets...</p>
    </div>`;

    try {
        const res = await fetch(`${API_BASE_URL}/admin/tickets?role=${currentUser.role}&userId=${currentUser.id}`);
        const data = await res.json();

        if (!data.tickets || data.tickets.length === 0) {
            document.getElementById('adminTicketsContainer').innerHTML = "<p>Nenhum ticket encontrado.</p>";
            return;
        }

        document.getElementById('adminTicketsContainer').innerHTML = data.tickets.map(t => {
            const hasMessages = t.messages && t.messages.length > 0;
            const lastMsg = hasMessages ? t.messages[t.messages.length - 1].message : t.message;

            const isAssigned = !!t.assigned_to;
            const assignee = t.assigned_to || 'Ninguém';
            const unreadDot = t.has_unread_admin ? `<span style="display:inline-block; margin-left:5px; padding:2px 6px; background:red; color:white; border-radius:10px; font-size:0.7rem;">NOVA</span>` : '';

            let assignAction = '';
            if (!isAssigned) {
                assignAction = `<button class="btn-outline" onclick="assumeTicket('${t.id}')" style="font-size:0.75rem; padding:4px 8px; margin-right:5px; background:#00bd9d; border:none; color:white;"><i class="fa-solid fa-user-plus"></i> Assumir</button>`;
            } else {
                const amIAssigned = String(t.assigned_by_id) === String(currentUser.id);
                const color = amIAssigned ? '#00ff88' : '#aaa';
                assignAction = `<span style="font-size:0.75rem; color:${color}; margin-right:10px;"><i class="fa-solid fa-user-lock"></i> ${assignee}</span>`;
            }

            return `
            <div style="background:#222; padding:15px; margin-bottom:15px; border-radius:8px; border-left: 4px solid ${t.has_unread_admin ? 'red' : (t.status === 'Open' ? '#00ff88' : '#888')};">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <div>
                        <strong style="color:white; font-size:1.1rem;">${t.subject} ${unreadDot}</strong>
                        <br>
                        <span style="color:var(--primary-color); font-size:0.9rem;">${t.username || 'User'}</span>
                    </div>
                    <div style="text-align:right;">
                        <small style="color:#aaa;">${new Date(t.created_at).toLocaleDateString()}</small>
                        <br>
                        ${assignAction}
                    </div>
                </div>
                
                <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:4px; margin-bottom:10px; color:#ccc; font-size:0.9rem;">
                    <i class="fa-solid fa-quote-left" style="color:#555; margin-right:5px;"></i> ${lastMsg}
                </div>
                
                <button class="cta-button" onclick="openAdminTicketChat('${t.id}', '${escapeHtml(t.subject)}', '${t.user_id}')" style="padding:8px 20px; font-size:0.8rem;">
                    <i class="fa-solid fa-reply"></i> VER / RESPONDER
                </button>
            </div>
        `}).join('');

    } catch (e) {
        console.error(e);
        document.getElementById('adminTicketsContainer').innerHTML = "<p>Erro ao carregar tickets.</p>";
    }
}

async function assumeTicket(ticketId) {
    if (!confirm("Deseja assumir este ticket para você?")) return;
    try {
        const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}/assume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, username: currentUser.username, role: currentUser.role })
        });
        if (res.ok) {
            renderAdminTickets(document.getElementById('dashDynamicContent'));
        }
    } catch (e) { console.error(e); }
}

let currentTicketId = null;

function openAdminTicketChat(ticketId, subject, userId) {
    let modal = document.getElementById('adminTicketModal');
    if (!modal) {
        const div = document.createElement('div');
        div.id = 'adminTicketModal';
        div.className = 'modal';
        div.style.zIndex = '3500';
        div.innerHTML = `
            <div class="modal-content" style="max-width:600px; width:95%; height:80vh; display:flex; flex-direction:column;">
                <span class="close" onclick="document.getElementById('adminTicketModal').style.display='none'">&times;</span>
                <h3 id="admTicketTitle" style="border-bottom:1px solid #333; padding-bottom:10px;">Ticket Chat</h3>
                <div id="admTicketChatBox" style="flex:1; overflow-y:auto; background:#111; padding:15px; margin:10px 0; border-radius:8px; border:1px solid #333;"></div>
                <form onsubmit="sendTicketReply(event)" style="display:flex; gap:10px;">
                    <input type="text" id="admTicketInput" placeholder="Sua resposta..." autocomplete="off" style="flex:1; padding:10px; background:#222; color:white; border:1px solid #444; border-radius:4px;">
                    <button type="submit" class="cta-button" style="width:auto;"><i class="fa-solid fa-paper-plane"></i></button>
                </form>
            </div>
        `;
        document.body.appendChild(div);
        modal = div;
    }

    currentTicketId = ticketId;
    document.getElementById('admTicketTitle').innerHTML = `<i class="fa-solid fa-comments"></i> ${subject}`;
    modal.style.display = 'flex';

    // Mark as read immediately for admin
    markTicketRead(ticketId, 'admin');

    loadTicketMessages(ticketId);
}

async function loadTicketMessages(ticketId) {
    const box = document.getElementById('admTicketChatBox');
    box.innerHTML = '<p style="text-align:center; color:#666;">Carregando...</p>';

    try {
        const res = await fetch(`${API_BASE_URL}/admin/tickets?role=${currentUser.role}`);
        const data = await res.json();
        const ticket = data.tickets.find(t => t.id === ticketId);

        if (ticket) {
            let html = `
                <div style="margin-bottom:15px; background:rgba(255,0,0,0.1); padding:10px; border-radius:8px;">
                     <strong style="color:var(--primary-color);">Ticket Original:</strong><br>
                     ${ticket.message}
                </div>
            `;

            if (ticket.messages && ticket.messages.length > 0) {
                html += ticket.messages.map(m => `
                    <div style="margin: 10px 0; text-align: ${m.sender === 'admin' || m.sender === currentUser.username ? 'right' : 'left'};">
                        <div style="display:inline-block; padding:8px 12px; border-radius:8px; background: ${m.sender === 'admin' || m.sender === currentUser.username ? '#0078d4' : '#333'}; color:white; max-width:80%;">
                             <small style="display:block; opacity:0.7; font-size:0.7rem;">${m.sender}</small>
                             ${m.message}
                        </div>
                    </div>
                `).join('');
            }

            box.innerHTML = html;
            box.scrollTop = box.scrollHeight;
        }
    } catch (e) {
        box.innerHTML = "Erro ao carregar mensagens.";
    }
}

async function sendTicketReply(e) {
    e.preventDefault();
    const input = document.getElementById('admTicketInput');
    const message = input.value.trim();
    if (!message || !currentTicketId) return;

    try {
        const res = await fetch(`${API_BASE_URL}/tickets/${currentTicketId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id, // Who is sending
                sender: currentUser.username, // Using username for display clarity
                message,
                role: currentUser.role
            })
        });

        if (res.ok) {
            input.value = '';
            loadTicketMessages(currentTicketId);
        } else {
            alert('Erro ao enviar.');
        }
    } catch (err) {
        console.error(err);
        alert('Erro de conexão');
    }
}
// === BOT MANAGER FUNCTIONS ===

const BOT_TOKEN = ''; // REMOVED FOR SECURITY (GitHub Blocked). Add via UI or backend.
const BOT_CLIENT_ID = '1467189771762925660';
let botDocId = null;
let botGuilds = [];

// Add bot on login
async function initializeBot() {
    if (!currentUser) return;

    try {
        const res = await fetch(`${API_BASE_URL}/bots/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                botToken: BOT_TOKEN
            })
        });

        if (res.ok) {
            const data = await res.json();
            botDocId = data.id;
            console.log('✅ Bot inicializado:', data.bot.bot_name);
            await loadBotGuilds();
        } else {
            // Bot may already exist, try to fetch it
            await fetchExistingBot();
        }
    } catch (e) {
        console.error('Erro ao inicializar bot:', e);
        await fetchExistingBot();
    }
}

async function fetchExistingBot() {
    try {
        const res = await fetch(`${API_BASE_URL}/bots/${currentUser.id}`);
        if (res.ok) {
            const data = await res.json();
            if (data.bots && data.bots.length > 0) {
                botDocId = data.bots[0].id;
                await loadBotGuilds();
            }
        }
    } catch (e) {
        console.error('Erro ao buscar bot:', e);
    }
}

async function loadBotGuilds() {
    if (!botDocId) {
        console.log('⚠️ BotDocId não definido, tentando buscar bot existente...');
        await fetchExistingBot();
        if (!botDocId) {
            console.error('❌ Não foi possível encontrar o bot');
            return;
        }
    }

    try {
        console.log('Carregando guilds do bot:', botDocId);
        const res = await fetch(`${API_BASE_URL}/bots/${botDocId}/guilds`);
        if (res.ok) {
            const data = await res.json();
            botGuilds = data.guilds || [];
            console.log('✅ Guilds carregadas:', botGuilds.length, botGuilds);
        } else {
            console.error('❌ Erro ao carregar guilds:', res.status, await res.text());
        }
    } catch (e) {
        console.error('❌ Erro ao carregar servidores:', e);
    }
}

async function renderBotManager() {
    const content = document.getElementById('dashDynamicContent');
    if (!content) return;

    // Reload guilds to get fresh data
    await loadBotGuilds();

    console.log('Renderizando Bot Manager. Guilds disponíveis:', botGuilds.length);

    const html = `
        <div class="bot-manager-container">
            <h2><i class="fa-brands fa-discord"></i> Discord Bot Manager</h2>
            
            <div class="bot-actions">
                <div class="action-card">
                    <h3><i class="fa-solid fa-paper-plane"></i> Enviar Mensagem</h3>
                    <p>Envie uma mensagem para qualquer canal do Discord</p>
                    
                    <div class="form-group">
                        <label>Servidor</label>
                        <select id="msgGuildSelect" onchange="updateChannelList()">
                            <option value="">Selecione um servidor</option>
                            ${botGuilds.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Canal</label>
                        <select id="msgChannelSelect">
                            <option value="">Selecione um servidor primeiro</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Mensagem</label>
                        <textarea id="msgContent" rows="4" placeholder="Digite sua mensagem aqui..."></textarea>
                    </div>
                    
                    <button onclick="sendDiscordMessage()" class="btn-primary">
                        <i class="fa-solid fa-paper-plane"></i> Enviar Mensagem
                    </button>
                </div>
                
                <div class="action-card">
                    <h3><i class="fa-solid fa-user-plus"></i> Adicionar Membro</h3>
                    <p>Adicione usuários verificados ao servidor Discord</p>
                    
                    <div class="form-group">
                        <label>Servidor</label>
                        <select id="addMemberGuildSelect">
                            <option value="">Selecione um servidor</option>
                            ${botGuilds.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Usuário</label>
                        <select id="addMemberUserSelect">
                            <option value="">Carregando usuários...</option>
                        </select>
                        <small>Selecione um usuário com Discord vinculado</small>
                    </div>
                    
                    <button onclick="addMemberToGuild()" class="btn-primary">
                        <i class="fa-solid fa-user-plus"></i> Adicionar ao Servidor
                    </button>
                    
                    <button onclick="addAllMembersToGuild()" class="btn-secondary" style="margin-top: 10px;">
                        <i class="fa-solid fa-users"></i> Puxar Todos
                    </button>
                </div>
            </div>
        </div>
        
        <style>
            .bot-manager-container {
                padding: 20px;
            }
            
            .bot-manager-container h2 {
                color: #5865f2;
                margin-bottom: 30px;
            }
            
            .bot-actions {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                gap: 20px;
            }
            
            .action-card {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 60, 60, 0.2);
                border-radius: 8px;
                padding: 24px;
            }
            
            .action-card h3 {
                color: #fff;
                margin-bottom: 8px;
                font-size: 20px;
            }
            
            .action-card p {
                color: #888;
                margin-bottom: 20px;
                font-size: 14px;
            }
            
            .form-group {
                margin-bottom: 16px;
            }
            
            .form-group label {
                display: block;
                color: #fff;
                margin-bottom: 8px;
                font-weight: 500;
            }
            
            .form-group select,
            .form-group input,
            .form-group textarea {
                width: 100%;
                padding: 12px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 60, 60, 0.3);
                border-radius: 4px;
                color: #fff;
                font-family: inherit;
            }
            
            .form-group small {
                color: #888;
                font-size: 12px;
                display: block;
                margin-top: 4px;
            }
            
            .form-group textarea {
                resize: vertical;
                min-height: 100px;
            }
            
            .btn-primary {
                background: #5865f2;
                color: white;
                padding: 12px 24px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s;
                width: 100%;
            }
            
            .btn-primary:hover {
                background: #4752c4;
                transform: translateY(-2px);
            }
            
            .btn-primary i {
                margin-right: 8px;
            }
            
            .btn-secondary {
                background: rgba(255, 60, 60, 0.2);
                color: #ff3c3c;
                padding: 12px 24px;
                border: 1px solid #ff3c3c;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s;
                width: 100%;
            }
            
            .btn-secondary:hover {
                background: rgba(255, 60, 60, 0.3);
                transform: translateY(-2px);
            }
            
            .btn-secondary i {
                margin-right: 8px;
            }
        </style>
    `;

    content.innerHTML = html;

    // Load Discord users after rendering
    await loadDiscordUsers();
}

function updateChannelList() {
    const guildSelect = document.getElementById('msgGuildSelect');
    const channelSelect = document.getElementById('msgChannelSelect');

    if (!guildSelect || !channelSelect) return;

    const selectedGuildId = guildSelect.value;
    const guild = botGuilds.find(g => g.id === selectedGuildId);

    if (!guild || !guild.channels) {
        channelSelect.innerHTML = '<option value="">Nenhum canal encontrado</option>';
        return;
    }

    channelSelect.innerHTML = '<option value="">Selecione um canal</option>' +
        guild.channels.map(c => `<option value="${c.id}">#${c.name}</option>`).join('');
}

async function sendDiscordMessage() {
    const channelId = document.getElementById('msgChannelSelect').value;
    const message = document.getElementById('msgContent').value;

    if (!channelId || !message) {
        showNotify('error', 'Preencha todos os campos');
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/bots/${botDocId}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, message })
        });

        if (res.ok) {
            showNotify('success', 'Mensagem enviada com sucesso!');
            document.getElementById('msgContent').value = '';
        } else {
            showNotify('error', 'Erro ao enviar mensagem');
        }
    } catch (e) {
        console.error(e);
        showNotify('error', 'Erro ao enviar mensagem');
    }
}

async function addMemberToGuild() {
    const guildId = document.getElementById('addMemberGuildSelect').value;
    const userSelect = document.getElementById('addMemberUserSelect');
    const selectedUserId = userSelect.value; // This is the Firestore document ID

    if (!guildId || !selectedUserId) {
        showNotify('error', 'Preencha todos os campos');
        return;
    }

    // Get username for display
    const selectedOption = userSelect.options[userSelect.selectedIndex];
    const username = selectedOption.dataset.username;

    showNotify('info', `Adicionando ${username}...`);

    try {
        const res = await fetch(`${API_BASE_URL}/bots/${botDocId}/add-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                guildId,
                userId: selectedUserId // Send Firestore document ID, server will fetch discord_id and access_token
            })
        });

        const data = await res.json();
        if (res.ok) {
            showNotify('success', data.message);
        } else {
            showNotify('error', data.message || 'Erro ao adicionar membro');
        }
    } catch (e) {
        console.error(e);
        showNotify('error', 'Erro ao adicionar membro');
    }
}

async function addAllMembersToGuild() {
    const guildId = document.getElementById('addMemberGuildSelect').value;
    const userSelect = document.getElementById('addMemberUserSelect');

    if (!guildId) {
        showNotify('error', 'Selecione um servidor primeiro');
        return;
    }

    // Get all user IDs from the select options (except first empty option)
    const userIds = Array.from(userSelect.options)
        .filter(opt => opt.value) // Skip empty option
        .map(opt => opt.value);

    if (userIds.length === 0) {
        showNotify('error', 'Nenhum usuário com Discord vinculado');
        return;
    }

    const confirmMsg = `Deseja adicionar ${userIds.length} usuário(s) ao servidor?`;
    if (!confirm(confirmMsg)) return;

    showNotify('info', `Adicionando ${userIds.length} membros...`);

    try {
        const res = await fetch(`${API_BASE_URL}/bots/${botDocId}/add-members-bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId, userIds })
        });

        const data = await res.json();
        if (res.ok) {
            const successCount = data.results.success.length;
            const failedCount = data.results.failed.length;
            showNotify('success', `✅ ${successCount} adicionados, ❌ ${failedCount} falharam`);
            console.log('Resultados detalhados:', data.results);
        } else {
            showNotify('error', data.message || 'Erro ao adicionar membros');
        }
    } catch (e) {
        console.error(e);
        showNotify('error', 'Erro ao adicionar membros');
    }
}

async function loadDiscordUsers() {
    console.log('🔍 Iniciando carregamento de usuários Discord...');
    try {
        const res = await fetch(`${API_BASE_URL}/users/discord-linked`);
        console.log('📡 Response status:', res.status);

        if (res.ok) {
            const data = await res.json();
            console.log('📦 Data received:', data);

            const userSelect = document.getElementById('addMemberUserSelect');
            if (!userSelect) {
                console.error('❌ Elemento addMemberUserSelect não encontrado!');
                return;
            }

            if (data.users.length === 0) {
                console.warn('⚠️ Nenhum usuário com Discord vinculado encontrado');
                userSelect.innerHTML = '<option value="">Nenhum usuário com Discord vinculado</option>';
                return;
            }

            userSelect.innerHTML = '<option value="">Selecione um usuário</option>' +
                data.users.map(u => `
                    <option 
                        value="${u.id}" 
                        data-discord-id="${u.discord_id}"
                        data-username="${u.username}">
                        ${u.username} (@${u.discord_username || 'N/A'})
                    </option>
                `).join('');

            console.log(`✅ ${data.users.length} usuários com Discord carregados`);
        } else {
            console.error('❌ Erro na resposta:', res.status, await res.text());
        }
    } catch (e) {
        console.error('❌ Erro ao carregar usuários Discord:', e);
    }
}

// === BOT MANAGER AUTO-INIT ===
// Enable Bot Manager tab and initialize bot for admins
(function () {
    // Wait for DOM and user to be loaded
    const checkAndInit = () => {
        if (currentUser && currentUser.role === 'admin') {
            // Enable Bot Manager tab
            const botTab = document.getElementById('botManagerTab');
            if (botTab) {
                botTab.style.display = 'block';
            }
            // Don't auto-initialize bot to prevent rate limiting
            // User can manually trigger it by opening the Bot Manager tab
            /*
            if (typeof initializeBot === 'function') {
                initializeBot();
            }
            */
        }
    };

    // Check immediately if already loaded
    if (typeof currentUser !== 'undefined' && currentUser) {
        checkAndInit();
    }

    // Also check after a short delay to catch late initialization
    setTimeout(checkAndInit, 2000);
})();
