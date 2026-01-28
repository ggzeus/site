let currentMode = 'login';
let currentUser = null;
// productsData agora será preenchido pela API
let productsData = [];

// Verifica auto-login ao iniciar
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('scarlet_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            loginSuccess(currentUser, true);
        } catch (e) {
            console.error("Erro ao restaurar sessão", e);
        }
    }
});

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
                    role: data.role
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
        if (data.licenses) {
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
                <h2><i class="fa-solid fa-tag"></i> Promoções Ativas</h2>
                <div class="product-card promo-card-highlight" style="padding: 20px;">
                    <h3>Pacote Full Access</h3>
                    <p>Tenha acesso a todos os produtos Scarlet por um preço único.</p>
                    <button class="cta-button" onclick="alert('Funcionalidade em desenvolvimento')">VER OFERTA</button>
                </div>
            `;
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
            container.innerHTML = `
                <h2>Configurações da Conta</h2>
                <div class="status-box" style=" max-width: 500px; border-left-color: #555;">
                    <div class="input-group">
                        <label style="color:#aaa; display:block; margin-bottom:5px;">Email Atual</label>
                        <input type="text" value="${currentUser ? currentUser.email : ''}" disabled style="opacity:0.7">
                    </div>
                    <!-- Form de Update (igual ao original) -->
                    <h3 style="margin-top:20px; color:var(--primary-color);">Atualizar Dados</h3>
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
            break;

        case 'admin':
            if (currentUser.role !== 'admin') {
                container.innerHTML = "<h2>Acesso Negado</h2>";
                return;
            }
            renderAdminPanel(container);
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
    `;

    // Carrega a lista no painel admin
    loadAdminResellers_Render();
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
            alert('Revendedor adicionado!');
            document.getElementById('resName').value = '';
            document.getElementById('resLink').value = '';
            document.getElementById('resContact').value = '';
            document.getElementById('resLogoBase64').value = '';
            document.getElementById('resLogo').value = '';
            document.getElementById('pasteStatus').innerText = "Clique aqui e pressione Ctrl+V para colar logo";
            document.getElementById('pasteStatus').style.color = "#888";
            loadAdminResellers_Render();
        } else {
            alert('Erro ao adicionar.');
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
                name, type, category, price_daily, price_weekly, price_monthly, price_lifetime, expires, status, seller_key, update
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
                name, type, category, price_daily, price_weekly, price_monthly, price_lifetime, expires, status, seller_key
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
            actionHTML = `<button class="download-btn" onclick="alert('Iniciando Download do ${prod.name}...')"><i class="fa-solid fa-download"></i> DOWNLOAD</button>`;
        } else {
            // Se nao tem licenca, mostra cadeado e opcao de comprar. NAO exibe valor no card.
            actionHTML = `
                <div class="locked-overlay" id="overlay-${prod.id}">
                    <i class="fa-solid fa-lock lock-icon-anim" id="lock-${prod.id}" style="font-size: 3rem; margin-bottom: 15px;"></i>
                    <button class="buy-btn" id="btn-${prod.id}" onclick="buyProduct(${prod.id})">COMPRAR</button>
                </div>
            `;
        }

        // Data de atualização (simulada ou real)
        const lastUpdate = prod.update_date || 'Recente';
        // Expiração da Key (Texto informativo)
        const expirationInfo = prod.expires || 'N/A';

        html += `
        <div class="product-card ${lockedClass}" id="card-${prod.id}">
            <div class="card-image">
                <div class="card-title-overlay">${prod.name}</div>
            </div>
            ${actionHTML}
            
            <div class="card-details">
                <div><span class="label">Status</span> <span class="status-active">${prod.status || 'Undetected'}</span></div>
                <div><span class="label">Validade</span> <span>${expirationInfo}</span></div>
                <div><span class="label">Atualização</span> <span>${lastUpdate}</span></div>
            </div>
        </div>
        `;
    });
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
            actionHTML = `<button class="download-btn" onclick="alert('Baixando Conteúdo...')"><i class="fa-solid fa-download"></i> DOWNLOAD</button>`;
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
    const toast = document.getElementById('successToast');
    const msg = document.getElementById('successMsg');

    msg.innerHTML = `Você acabou de resgatar o <strong>${productName}</strong>!`;
    toast.style.top = "20px";

    setTimeout(() => {
        toast.style.top = "-100px";
    }, 4000);
}