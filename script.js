let currentMode = 'login';
let currentUser = null;
// productsData agora será preenchido pela API
let productsData = [];
let socket = null;
let currentDocLang = 'javascript'; // Start with JS
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
        emailInput.required = false;
    } else {
        title.innerText = 'Junte-se ao Scarlet';
        btn.innerText = 'REGISTRAR';
        emailGroup.style.display = 'block';
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
    toast.className = `notification-toast ${type}`;

    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-triangle';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
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

    const endpoint = currentMode === 'login' ? '/login' : '/register';
    const msg = document.getElementById('msg');
    const payload = currentMode === 'login' ? { user, pass } : { user, pass, email };

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
                msg.style.color = '#00ff00';
                msg.innerText = 'Conta criada! Faça login.';
                document.getElementById('username').value = '';
                document.getElementById('password').value = '';
                document.getElementById('email').value = '';
                setTimeout(() => showModal('login'), 1500);
            }
        } else {
            msg.style.color = 'red';
            msg.innerText = data.message;
        }
    } catch (error) {
        msg.innerText = "Erro de conexão";
    }
});

async function loginSuccess(userData, isAutoLogin = false) {
    if (!isAutoLogin) {
        localStorage.setItem('scarlet_user', JSON.stringify(userData));
        closeModal();
    }

    document.getElementById('homeSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';

    document.getElementById('authButtons').style.display = 'none';
    const userMenu = document.getElementById('userMenu');
    userMenu.style.display = 'block';

    const welcomeEl = document.getElementById('welcomeUser');
    if (welcomeEl) welcomeEl.innerText = userData.username;

    // Lógica ADMIN
    // Fallback para sessão antiga: Se for 'zeus' e não tiver role definida, assume admin
    if (userData.username === 'zeus' && !userData.role) {
        userData.role = 'admin';
        localStorage.setItem('scarlet_user', JSON.stringify(userData));
    }

    const adminTab = document.getElementById('adminTab');
    if (userData.role === 'admin') {
        adminTab.style.display = 'block';
    } else {
        adminTab.style.display = 'none';
    }

    const devTab = document.getElementById('developerTab');
    if (userData.is_developer) {
        devTab.style.display = 'block';
    } else {
        devTab.style.display = 'none';
    }

    // Carrega produtos da API antes de inicializar a tela
    await fetchProducts();

    // Sincronizar Licenças
    await syncLicenses(userData.id);

    loadDashContent('intro');
}

async function fetchProducts() {
    try {
        const res = await fetch('/products');
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
        const response = await fetch(`/licenses/${userId}`);
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
        const res = await fetch(`/users/list?role=${currentUser.role}`);
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
        const res = await fetch('/resellers');
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
        const response = await fetch('/pay/pix', {
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
            const res = await fetch('/purchase', {
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


    if (!newEmail && !newPass) {
        msg.style.color = 'yellow';
        msg.innerText = 'Preencha ao menos um campo.';
        return;
    }

    try {
        const response = await fetch('/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                newEmail: newEmail,
                newPassword: newPass
            })
        });

        const data = await response.json();

        if (response.ok) {
            msg.style.color = '#00ff00';
            msg.innerText = data.message;
            if (newEmail) currentUser.email = newEmail;
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

// --- FUNÇÕES UTILITÁRIAS PARA OS CARDS NOVOS ---

// --- DOCS / CORREÇÃO DE ERROS ---
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
        const res = await fetch(`/comments/${topicId}`);
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
        const res = await fetch('/comments', {
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
        const res = await fetch('/redeem-key', {
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
        const res = await fetch('/posts');
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
            const res = await fetch('/api/send-update', {
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

    return `
        <div class="post-card ${isFeatured ? 'featured-post' : ''}" id="post-${post.id}">
            <div class="post-header">
                <div class="post-author">
                    <i class="fa-solid fa-user-circle" style="font-size:2rem; color:var(--primary-color);"></i>
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
        const res = await fetch('/posts', {
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
            const res = await fetch('/upload', {
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
        const res = await fetch(`/posts/${postId}/like`, {
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
            const res = await fetch('/upload', {
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
        const res = await fetch(`/posts/${postId}/comments`);
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
        const res = await fetch(`/posts/${postId}/comments`, {
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
        const res = await fetch(`/posts/${postId}`, {
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
        const res = await fetch('/upload', {
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
            if (!socket) {
                initChat();
            }
        }
    }
}

/* --- GLOBAL CHAT FUNCTIONS --- */

function initChat() {
    if (socket) return; // Já conectado

    // Conecta ao namespace raiz (o mesmo do server)
    socket = io();

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

function renderDevDocs(container) {
    const baseUrl = window.location.origin;

    // Snippets templates
    const snippets = {
        javascript: `fetch('${baseUrl}/api/check-user?username=USER_TESTE', {
    headers: { 'x-dev-token': '${currentUser.dev_token}' }
}).then(res => res.json()).then(console.log);`,

        python: `import requests

url = '${baseUrl}/api/check-user'
headers = {'x-dev-token': '${currentUser.dev_token}'}
params = {'username': 'USER_TESTE'}

response = requests.get(url, headers=headers, params=params)
print(response.json())`,

        csharp: `using System.Net.Http;

var client = new HttpClient();
client.DefaultRequestHeaders.Add("x-dev-token", "${currentUser.dev_token}");
var response = await client.GetAsync("${baseUrl}/api/check-user?username=USER_TESTE");
var content = await response.Content.ReadAsStringAsync();
Console.WriteLine(content);`,

        cpp: `// Usando CPR (C++ Requests)
#include <cpr/cpr.h>
#include <iostream>

int main() {
    auto r = cpr::Get(cpr::Url{"${baseUrl}/api/check-user"},
                      cpr::Parameters{{"username", "USER_TESTE"}},
                      cpr::Header{{"x-dev-token", "${currentUser.dev_token}"}});
    std::cout << r.text << std::endl;
    return 0;
}`,
        lua: `-- Exemplo FiveM / Scarlet Script
PerformHttpRequest('${baseUrl}/api/check-user?username=USER_TESTE', function(err, text, headers)
    print(text)
end, 'GET', '', { ['x-dev-token'] = '${currentUser.dev_token}' })`
    };

    const currentCode = snippets[currentDocLang] || snippets['javascript'];

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

        <!-- LANGUAGE SELECTOR -->
        <div style="margin-top:30px;">
            <h3>Exemplos de Integração</h3>
            <div class="community-subtabs" style="justify-content: flex-start; gap: 10px; margin-bottom: 10px;">
                ${['javascript', 'python', 'csharp', 'cpp', 'lua'].map(lang => `
                    <button class="subtab-btn ${currentDocLang === lang ? 'active' : ''}" 
                            onclick="switchDocLang('${lang}')"
                            style="padding: 5px 15px; font-size: 0.8rem;">
                        ${lang.toUpperCase().replace('CSHARP', 'C#').replace('CPP', 'C++')}
                    </button>
                `).join('')}
            </div>

            <div style="background:#1e1e1e; padding:15px; border-radius:8px; border:1px solid #333; position:relative;">
                <button onclick="copyCodeSnippet()" style="position:absolute; top:10px; right:10px; background:transparent; border:none; color:#aaa; cursor:pointer;" title="Copiar"><i class="fa-regular fa-copy"></i></button>
                <pre id="codeSnippetDisplay" style="font-family:monospace; font-size:0.85rem; color:#dcdcdc; overflow-x:auto; margin:0;">${currentCode}</pre>
            </div>
        </div>

        <!-- AI HELPER WIDGET -->

        <!-- AI HELPER WIDGET (DISABLED) -->
        <!--
        <div style="margin-top: 40px; border-top: 2px solid #333; padding-top: 20px;">
            <h3><i class="fa-solid fa-robot" style="color:#a468d6;"></i> IA Helper (Scarlet Support)</h3>
            <div id="aiChatBox" style="height: 250px; background: #111; border: 1px solid #333; border-radius: 8px; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px;">
                ${devChatMessages.map(msg => `
                    <div style="align-self: ${msg.role === 'user' ? 'flex-end' : 'flex-start'}; 
                                background: ${msg.role === 'user' ? '#0078d4' : '#2d2d30'}; 
                                color: white; padding: 8px 12px; border-radius: 15px; max-width: 80%; font-size: 0.9rem;">
                        ${msg.text}
                    </div>
                `).join('')}
            </div>
            <form onsubmit="handleAiChatSubmit(event)" style="margin-top: 10px; display: flex; gap: 10px;">
                <input type="text" id="aiChatInput" placeholder="Pergunte sobre a API ou peça um exemplo..." style="flex: 1; padding: 10px; background: #222; border: 1px solid #444; color: white; border-radius: 5px;">
                <button type="submit" class="cta-button" style="width: auto; padding: 0 20px;"><i class="fa-solid fa-paper-plane"></i></button>
            </form>
        </div>
        -->
    `;

    // Scroll chat to bottom
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
        const res = await fetch('/api/ai/chat', {
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
                    <input type="file" id="profileUpload" accept="image/*" style="display:none;" onchange="handleProfileUpload(this)">
                </div>

                <div class="input-group">
                    <label style="color:var(--text-muted); display:block; margin-bottom:5px;"><i class="fa-solid fa-user" style="margin-right:8px;"></i> Nome de Usuário</label>
                    <input type="text" value="${currentUser.username}" disabled style="opacity:0.7">
                </div>
                <div class="input-group">
                    <label style="color:var(--text-muted); display:block; margin-bottom:5px;"><i class="fa-solid fa-envelope" style="margin-right:8px;"></i> Email</label>
                    <input type="text" value="${currentUser.email}" disabled style="opacity:0.7">
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
        `;
        const isDark = config.darkMode !== false; // Default true

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
                    <input type="color" id="primaryColorPick" value="${config.primaryColor || '#ff0000'}" style="width:100%; height:40px; border:none; padding:0;" onchange="saveThemeSettings()">
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

async function handleProfileUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = async function (e) {
            const base64Info = e.target.result;
            document.getElementById('profilePreview').src = base64Info;

            // Save to server
            try {
                const res = await fetch('/user/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: currentUser.id,
                        profilePic: base64Info
                    })
                });
                if (res.ok) {
                    currentUser.profile_pic = base64Info;
                    localStorage.setItem('scarlet_user', JSON.stringify(currentUser));
                    showNotify('success', 'Foto atualizada!');
                }
            } catch (err) {
                console.error(err);
                showNotify('error', 'Erro ao salvar foto.');
            }
        }
        reader.readAsDataURL(file);
    }
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
        const res = await fetch('/hwid-reset', {
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
        const res = await fetch('/tickets', {
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
        const res = await fetch(`/tickets/${currentUser.id}`);
        const data = await res.json();
        const list = document.getElementById('myTicketsList');
        if (!list) return;

        if (data.tickets && data.tickets.length > 0) {
            list.innerHTML = `<h4 style="margin-top:20px;">Meus Tickets</h4>` + data.tickets.map(t => `
                <div style="background:#222; padding:10px; margin-bottom:10px; border-radius:4px; border-left: 3px solid #777;">
                    <div style="display:flex; justify-content:space-between;">
                        <strong>${t.subject}</strong>
                        <span style="font-size:0.8rem; color:#aaa;">${new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                    <p style="font-size:0.9rem; color:#ccc; margin-top:5px;">${t.message}</p>
                    <small style="color:${t.status === 'Open' ? '#00ff88' : '#888'}">Status: ${t.status}</small>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<p style="color:#666; margin-top:10px;">Nenhum ticket encontrado.</p>';
        }
    } catch (err) { console.error(err); }
}
