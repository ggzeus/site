# Como Compilar o ScarletMenuFetcher

## ✅ Correções Aplicadas

O arquivo `index.cpp` foi corrigido para usar **WinINet** ao invés de **WinHTTP**, tornando-o compatível com MinGW.

### Mudanças realizadas:
- ✅ Substituído `winhttp.h` por `wininet.h`
- ✅ Reescrita a função `HttpGet()` usando WinINet API
- ✅ Implementação inline de `__cpuid` para MinGW (sem depender de `intrin.h`)

## 📝 Como Compilar

### Opção 1: Usando o mesmo terminal que compilou o main.cpp

Abra o **mesmo terminal** que você usou para compilar o `main.cpp` (Git Bash, MSYS2, MinGW Prompt, etc.) e execute:

```bash
g++ -o ScarletMenuFetcher.exe index.cpp -lwininet -static -O2 -s
```

### Opção 2: Usando o script compile_index_simple.bat

Execute o script `compile_index_simple.bat` no terminal apropriado (não no PowerShell padrão).

### Opção 3: Adicionar MinGW ao PATH do Windows

1. Encontre onde o `g++.exe` está instalado (provavelmente em `C:\MinGW\bin\` ou similar)
2. Adicione esse caminho às variáveis de ambiente do Windows
3. Reinicie o terminal e execute o script normalmente

## ⚙️ Configuração Necessária

Antes de executar o `ScarletMenuFetcher.exe`, edite o arquivo `index.cpp` e configure:

```cpp
const std::wstring SERVER_HOST = L"localhost";  // ou seu domínio
const int SERVER_PORT = 80;
const std::wstring APP_ID = L"YOUR_APP_ID";
const std::wstring APP_SECRET = L"YOUR_APP_SECRET";
```

## 🚀 Uso

Após compilar e configurar, execute:

```
ScarletMenuFetcher.exe
```

O programa irá:
1. Obter o HWID do sistema
2. Buscar informações do usuário pelo HWID
3. Buscar informações de expiração
4. Exibir todas as informações formatadas
