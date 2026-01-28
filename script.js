let currentMode = 'login';

function showModal(mode) {
    currentMode = mode;
    const modal = document.getElementById('authModal');
    const title = document.getElementById('modalTitle');
    const btn = document.getElementById('submitBtn');
    const msg = document.getElementById('msg');
    
    msg.innerText = '';
    modal.style.display = 'flex';
    
    if (mode === 'login') {
        title.innerText = 'Acessar Scarlet';
        btn.innerText = 'ENTRAR';
    } else {
        title.innerText = 'Junte-se ao Scarlet';
        btn.innerText = 'REGISTRAR';
    }
}

function closeModal() {
    document.getElementById('authModal').style.display = 'none';
}

document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const endpoint = currentMode === 'login' ? '/login' : '/register';
    const msg = document.getElementById('msg');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, pass })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            if (currentMode === 'login') {
                loginSuccess(user);
            } else {
                msg.style.color = '#00ff00';
                msg.innerText = 'Conta criada! Faça login.';
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

function loginSuccess(user) {
    closeModal();
    document.getElementById('homeSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    
    document.getElementById('authButtons').style.display = 'none';
    const userMenu = document.getElementById('userMenu');
    userMenu.style.display = 'block';
    document.getElementById('welcomeUser').innerText = user;
}

function logout() {
    location.reload();
}

// ... (Código anterior de Login/Modal permanece o mesmo) ...

// --- Lógica da Dashboard ---

// Simulação de Banco de Dados de Produtos
// hasLicense: false = Bloqueado/Escuro
// hasLicense: true = Ativo/Colorido
let productsData = [
    { id: 1, name: 'Scarlet Menu', type: 'Mod Menu', status: 'Working', update: '27/01/2026', expires: '30 Dias', hasLicense: false },
    { id: 2, name: 'Scarlet External', type: 'External ESP', status: 'Working', update: '25/01/2026', expires: 'Vitalício', hasLicense: false },
    { id: 3, name: 'Scarlet Roblox', type: 'Executor', status: 'Working', update: '20/01/2026', expires: '15 Dias', hasLicense: false },
    { id: 4, name: 'Scarlet Free-Fire', type: 'Mobile Injector', status: 'Working', update: '28/01/2026', expires: '30 Dias', hasLicense: false },
    { id: 5, name: 'Scarlet Spoofer', type: 'HWID Bypass', status: 'Working', update: '10/01/2026', expires: 'Vitalício', hasLicense: false }
];

// Função que gerencia o clique no menu lateral
function loadDashContent(section) {
    const container = document.getElementById('dashDynamicContent');
    
    // Atualiza classe ativa no menu (visual)
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active-tab'));
    event.currentTarget.classList.add('active-tab');

    // Renderiza o conteúdo baseado na aba
    switch(section) {
        case 'intro':
            container.innerHTML = `
                <h2>Bem-vindo ao Scarlet</h2>
                <p>Selecione uma opção no menu para gerenciar seus produtos.</p>
                <div style="background:#111; padding:20px; border-left: 3px solid #ff2400; margin-top:20px;">
                    <h3>Status do Sistema</h3>
                    <p style="color:#00ff00"><i class="fa-solid fa-check-circle"></i> Todos os sistemas operacionais.</p>
                </div>
            `;
            break;

        case 'promo':
            container.innerHTML = `
                <h2><i class="fa-solid fa-tag"></i> Promoções Ativas</h2>
                <div class="product-card" style="padding:20px; border: 1px dashed #ff2400;">
                    <h3>Pacote Full Access</h3>
                    <p>Tenha acesso a todos os produtos Scarlet por um preço único.</p>
                    <button class="cta-button" onclick="alert('Redirecionando para checkout...')">VER OFERTA</button>
                </div>
            `;
            break;

        case 'addons':
            container.innerHTML = `
                <h2>Conteúdos Adicionais</h2>
                <p>Configurações legítimas (CFGs), Scripts Lua e Temas visuais.</p>
                <p><em>Em breve...</em></p>
            `;
            break;

        case 'install':
            renderProducts(container);
            break;
            
        case 'config':
            container.innerHTML = `<h2>Configurações da Conta</h2><p>Alterar senha e email.</p>`;
            break;
    }
}

// Renderiza o GRID com suporte a animação
function renderProducts(container) {
    let html = `<h2>Seus Produtos</h2><div class="products-grid">`;

    productsData.forEach(prod => {
        const lockedClass = prod.hasLicense ? '' : 'locked';
        
        let actionHTML = '';
        
        if (prod.hasLicense) {
            actionHTML = `<button class="download-btn" onclick="alert('Baixando...')"><i class="fa-solid fa-download"></i> BAIXAR CLIENTE</button>`;
        } else {
            // ADICIONADO: Um ícone de cadeado explícito para animarmos
            actionHTML = `
                <div class="locked-overlay" id="overlay-${prod.id}">
                    <i class="fa-solid fa-lock lock-icon-anim" id="lock-${prod.id}"></i>
                    <button class="buy-btn" id="btn-${prod.id}" onclick="buyProduct(${prod.id})">COMPRAR AGORA</button>
                </div>
            `;
        }

        // ADICIONADO: id="card-${prod.id}" para o JS encontrar esse card específico
        html += `
        <div class="product-card ${lockedClass}" id="card-${prod.id}">
            <div class="card-image">
                <div class="card-title-overlay">${prod.name}</div>
            </div>
            ${actionHTML}
            
            <div class="card-details">
                <div>
                    <span class="label">Status</span><br>
                    <span class="status-active"><i class="fa-solid fa-circle-check"></i> ${prod.status}</span>
                </div>
                <div>
                    <span class="label">Última Atualização</span><br>
                    <span>${prod.update}</span>
                </div>
                <div>
                    <span class="label">Expira em</span><br>
                    <span style="color: ${prod.hasLicense ? '#fff' : '#555'}">${prod.hasLicense ? prod.expires : '---'}</span>
                </div>
            </div>
        </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

// Lógica da Cutscene de Compra
function buyProduct(id) {
    const product = productsData.find(p => p.id === id);
    
    // Passo 1: Pega os elementos do DOM
    const card = document.getElementById(`card-${id}`);
    const overlay = document.getElementById(`overlay-${id}`);
    const lockIcon = document.getElementById(`lock-${id}`);
    const btn = document.getElementById(`btn-${id}`);

    // Confirmação simples (opcional, pode remover se quiser direto)
    if(!confirm(`Adquirir ${product.name}?`)) return;

    // --- INÍCIO DA CUTSCENE ---

    // 1. Esconde o botão de comprar, deixa só o cadeado
    btn.style.display = 'none';

    // 2. Adiciona a classe que faz o cadeado tremer
    overlay.classList.add('shaking');

    // 3. Aguarda 800ms (tempo do tremor) e quebra o cadeado
    setTimeout(() => {
        overlay.classList.remove('shaking');
        overlay.classList.add('falling'); // O cadeado cai

        // 4. O Card começa a brilhar e perde o filtro cinza
        card.classList.remove('locked');
        card.classList.add('glowing-card');

        // 5. Mostra mensagem de sucesso
        showSuccessToast(product.name);

    }, 800);

    // 6. Depois que a animação de queda acabar (aprox 1.5s total), consolida os dados
    setTimeout(() => {
        // Atualiza o dado real
        product.hasLicense = true;
        
        // Re-renderiza tudo para garantir que o botão "Baixar" apareça
        // Mas vamos manter o brilho por mais um tempo se quiser, ou renderizar direto.
        // Vamos renderizar direto para aparecer o botão de download.
        const container = document.getElementById('dashDynamicContent');
        renderProducts(container);
        
        // Mantém o efeito de brilho no card recém renderizado por uns segundos
        const newCard = document.getElementById(`card-${id}`);
        newCard.style.animation = "cardGlow 2s forwards"; // Reaplica o brilho suave

    }, 2000);
}

// Função para exibir o Toast/Modal de topo
function showSuccessToast(productName) {
    const toast = document.getElementById('successToast');
    const msg = document.getElementById('successMsg');
    
    msg.innerHTML = `Você acabou de resgatar o <strong>${productName}</strong>!`;
    toast.style.top = "20px"; // Desce a notificação

    // Esconde depois de 4 segundos
    setTimeout(() => {
        toast.style.top = "-100px";
    }, 4000);
}

// Ao logar, carregar a intro por padrão
// (Modifique sua função loginSuccess para chamar loadDashContent('intro') no final)
const originalLoginSuccess = loginSuccess; // Hack para não quebrar seu código anterior
loginSuccess = function(user) {
    originalLoginSuccess(user); // Chama a lógica antiga de esconder/mostrar div
    loadDashContent('intro');   // Carrega o conteúdo inicial
}