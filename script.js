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