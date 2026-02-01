# Scarlet Auth Loader (C++)

## Descrição
Sistema completo de autenticação com suporte a:
- ✅ Login com usuário/senha
- ✅ Ativação via License Key  
- ✅ Detecção de HWID automática
- ✅ **Injeção de Payload** (baixa e executa .exe/.dll do servidor)
- ✅ Interface colorida no console

## Arquivos

### main.cpp
Loader principal com sistema completo de autenticação e injeção de payloads.

**Funcionalidades**:
- Inicialização de sessão
- Login/Ativação de key
- Download e execução de payloads da API
- Registro de componentes de hardware

### index.cpp  
Aplicação standalone que busca informações do usuário usando apenas HWID.

**Uso**: Perfeito para menus externos que não têm acesso ao código do loader, mas precisam exibir nome do usuário e dias restantes.

### Compilação

#### Compilar Loader Principal (main.cpp)
```bash
compile.bat
```
Gera: `ScarletLoader.exe`

#### Compilar Menu Fetcher (index.cpp)
```bash
compile_index.bat
```
Gera: `ScarletMenuFetcher.exe`

## Como Usar

### 1. Configurar Credenciais

Em ambos os arquivos (`main.cpp` e `index.cpp`), configure:

```cpp
const string API_URL = "http://your-server.com"; // Seu servidor
const string APP_ID = "your-app-id";
const string APP_SECRET = "your-app-secret";
const string OWNER_ID = "your-user-id";
```

### 2. Fazer Upload do Payload

1. Acesse o dashboard Partner → Minhas Aplicações
2. Clique em GERENCIAR na sua aplicação
3. Vá para a tab **Files**
4. Clique em **Upload File**
5. Preencha o nome do produto (ex: "MyCheat")
6. Selecione o arquivo .exe ou .dll
7. Aguarde o upload completar

### 3. Executar o Loader (main.cpp)

```
1. Escolher Login ou License Key
2. Após autenticar, escolher "Inject Payload"
3. Inserir o nome do produto (deve ser EXATO ao nome usado no upload)
4. Aguardar download e execução
```

O loader irá:
- Baixar o payload do Firebase Storage via URL assinada (30s de expiração)
- Salvar temporariamente em `%TEMP%\payload_temp.exe`
- Executar o payload
- Deletar o arquivo temporário

### 4. Executar o Menu Fetcher (index.cpp)

```
Simplesmente execute ScarletMenuFetcher.exe
```

O aplicativo irá:
- Detectar o HWID automaticamente
- Fazer chamadas GET às APIs:
  - `/auth/get-user/:appId/:hwid?appSecret=xxx`
  - `/auth/get-expiry/:appId/:hwid?appSecret=xxx`
- Exibir nome do usuário, dias restantes e level

**Importante**: O usuário deve ter feito login pelo menos uma vez pelo loader principal para que o HWID esteja registrado.

## Fluxo de Uso Completo

```
1. Usuário executa ScarletLoader.exe (main.cpp)
2. Faz login ou ativa key
3. Escolhe "Inject Payload"
4. Insere nome do produto
5. Payload é baixado e executado

6. [SEPARADAMENTE] Menu/Aplicação externa executa
7. Chama as APIs GET com o HWID
8. Exibe nome e informações do usuário
```

## Segurança

- ✅ URLs de download expiram em 30 segundos
- ✅ Downloads são verificados por HWID + Key válida
- ✅ Todos os acessos são logados no Discord
- ✅ HWIDs desconhecidos são reportados como suspeitos
- ✅ Arquivos armazenados de forma segura no Firebase Storage

## Observações

- **Payload executável**: Por padrão, o loader executa o .exe baixado em um novo processo. Para DLL injection, será necessário implementar lógica adicional de LoadLibrary ou manual mapping.
- **Detecção de antivírus**: Como o payload é baixado e executado em runtime, alguns antivírus podem flaggar. Considere assinar digitalmente os executáveis.
- **Nome do produto**: Deve ser EXATO ao usado no upload (case-sensitive).
