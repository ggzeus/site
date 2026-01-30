# Scarlet Auth Loader (C++)

## Descrição
Loader básico de autenticação em C++ que se conecta ao sistema Scarlet Auth via HTTP.

## Funcionalidades
- ✅ Inicialização de sessão com o servidor
- ✅ Login com usuário/senha
- ✅ Ativação via License Key
- ✅ Detecção de HWID automática
- ✅ Interface colorida no console

## Como Compilar

### Visual Studio (Recomendado)
1. Abra o Visual Studio
2. Crie um novo projeto "Console App" (C++)
3. Copie o código de `main.cpp` para o projeto
4. Compile em Release mode (x64)

### MinGW/G++
```bash
g++ main.cpp -o ScarletLoader.exe -lwininet -static
```

## Configuração

Antes de compilar, edite as seguintes constantes no `main.cpp`:

```cpp
const string OWNER_ID = "YOUR_OWNER_ID";      // Seu User ID
const string APP_SECRET = "YOUR_APP_SECRET";  // Secret da sua aplicação
const string API_URL = "http://localhost";    // URL do servidor
```

Além disso, substitua `YOUR_APP_ID` nas funções `Login()` e `CheckLicense()` pelo ID da sua aplicação criada no painel.

## Como Usar

1. Execute o `ScarletLoader.exe`
2. Escolha uma opção:
   - **1**: Login com usuário/senha
   - **2**: Ativar com License Key
3. Insira as credenciais
4. Se autenticado, o loader carrega a aplicação

## Notas de Segurança

⚠️ **IMPORTANTE**: Este é um exemplo básico para demonstração. Para produção, considere:
- Ofuscar strings sensíveis (APP_SECRET, API_URL)
- Implementar criptografia nas requisições
- Adicionar anti-debug e anti-tamper
- Usar HTTPS em produção

## Dependências
- Windows API (WinINet para HTTP requests)
- C++11 ou superior
