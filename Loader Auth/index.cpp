#include <windows.h>
#include <wininet.h>
#include <iostream>
#include <string>
#include <sstream>
#include <vector>
#include <io.h>
#include <fcntl.h>
#include <cstdio>
#include <cwchar>

#ifndef _O_U16TEXT
#define _O_U16TEXT 0x20000
#endif

#pragma comment(lib, "wininet.lib")

// CPUID inline para MinGW
inline void __cpuid(int* cpuInfo, int function) {
    __asm__ __volatile__(
        "cpuid"
        : "=a" (cpuInfo[0]), "=b" (cpuInfo[1]), "=c" (cpuInfo[2]), "=d" (cpuInfo[3])
        : "a" (function), "c" (0)
    );
}

// ==================================================
// CONFIGURAÇÃO - SUBSTITUA COM SEUS VALORES
// ==================================================
const std::wstring SERVER_HOST = L"localhost";  // ou seu domínio
const int SERVER_PORT = 80;
const std::wstring APP_ID = L"Scarlet External";
const std::wstring APP_SECRET = L"00347ecb6ab1084f15649e13aed2ba1d4e2693a81ba0b97ef3ec79943fd2a0fa";

// ==================================================
// FUNÇÃO PARA OBTER HWID
// ==================================================
std::wstring GetHWID() {
    std::wstring hwid;
    
    // Obter Volume Serial Number
    DWORD volumeSerial = 0;
    if (GetVolumeInformationW(L"C:\\", NULL, 0, &volumeSerial, NULL, NULL, NULL, 0)) {
        wchar_t buffer[128];
        swprintf(buffer, L"%08X", volumeSerial);
        hwid += buffer;
    }
    
    // Adicionar informações do processador
    int cpuInfo[4] = { 0 };
    __cpuid(cpuInfo, 0);
    wchar_t cpuBuffer[64];
    swprintf(cpuBuffer, L"-%08X%08X", cpuInfo[3], cpuInfo[0]);
    hwid += cpuBuffer;
    
    return hwid;
}

// ==================================================
// FUNÇÃO PARA URL ENCODE
// ==================================================
std::wstring UrlEncode(const std::wstring& str) {
    std::wstring encoded;
    for (wchar_t c : str) {
        if (iswalnum(c) || c == L'-' || c == L'_' || c == L'.' || c == L'~') {
            encoded += c;
        } else {
            wchar_t buf[4];
            swprintf(buf, L"%%%02X", (unsigned char)c);
            encoded += buf;
        }
    }
    return encoded;
}

// ==================================================
// FUNÇÃO PARA FAZER GET REQUEST
// ==================================================
std::string HttpGet(const std::wstring& path) {
    std::string response;
    
    // Construir URL completa
    std::wstring fullUrl = L"http://";
    fullUrl += SERVER_HOST;
    if (SERVER_PORT != 80) {
        wchar_t portBuf[16];
        swprintf(portBuf, L"%d", SERVER_PORT);
        fullUrl += L":" + std::wstring(portBuf);
    }
    fullUrl += path;
    
    // Abrir sessão HTTP
    HINTERNET hInternet = InternetOpenW(L"ScarletMenu/1.0",
        INTERNET_OPEN_TYPE_DIRECT,
        NULL,
        NULL,
        0);

    if (!hInternet) {
        std::wcerr << L"[ERRO] Falha ao abrir sessão HTTP" << std::endl;
        return "";
    }

    // Abrir URL
    HINTERNET hUrl = InternetOpenUrlW(hInternet,
        fullUrl.c_str(),
        NULL,
        0,
        INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE,
        0);

    if (!hUrl) {
        std::wcerr << L"[ERRO] Falha ao abrir URL" << std::endl;
        InternetCloseHandle(hInternet);
        return "";
    }

    // Ler resposta
    char buffer[4096];
    DWORD bytesRead;

    while (InternetReadFile(hUrl, buffer, sizeof(buffer) - 1, &bytesRead) && bytesRead > 0) {
        buffer[bytesRead] = 0;
        response += buffer;
    }

    // Limpar
    InternetCloseHandle(hUrl);
    InternetCloseHandle(hInternet);

    return response;
}

// ==================================================
// PARSE SIMPLES DE JSON (apenas para demonstração)
// ==================================================
std::string GetJsonValue(const std::string& json, const std::string& key) {
    std::string searchKey = "\"" + key + "\":";
    size_t pos = json.find(searchKey);
    if (pos == std::string::npos) return "";

    pos += searchKey.length();
    
    // Pular espaços e aspas
    while (pos < json.length() && (json[pos] == ' ' || json[pos] == '\"')) pos++;
    
    size_t end = pos;
    bool inString = json[pos - 1] == '\"';
    
    if (inString) {
        end = json.find('\"', pos);
    } else {
        while (end < json.length() && json[end] != ',' && json[end] != '}' && json[end] != ' ') {
            end++;
        }
    }
    
    if (end == std::string::npos) return "";
    
    return json.substr(pos, end - pos);
}

bool GetJsonBool(const std::string& json, const std::string& key) {
    std::string value = GetJsonValue(json, key);
    return value == "true";
}

// ==================================================
// FUNÇÃO PRINCIPAL - OBTER USER E EXPIRY
// ==================================================
void GetUserInfo() {
    std::wcout << L"================================================" << std::endl;
    std::wcout << L"      SCARLET MENU - USER INFO FETCHER" << std::endl;
    std::wcout << L"================================================" << std::endl;
    std::wcout << std::endl;

    // Passo 1: Obter HWID
    std::wcout << L"[1/3] Obtendo HWID do sistema..." << std::endl;
    std::wstring hwid = GetHWID();
    std::wcout << L"      HWID: " << hwid << std::endl;
    std::wcout << std::endl;

    // Passo 2: Obter Username
    std::wcout << L"[2/3] Buscando informações do usuário..." << std::endl;
    
    std::wstring getUserPath = L"/auth/get-user/" + APP_ID + L"/" + hwid + L"?appSecret=" + UrlEncode(APP_SECRET);
    std::string userResponse = HttpGet(getUserPath);

    if (userResponse.empty()) {
        std::wcerr << L"      [ERRO] Falha ao obter resposta do servidor" << std::endl;
        return;
    }

    bool success = GetJsonBool(userResponse, "success");
    
    if (!success) {
        std::string message = GetJsonValue(userResponse, "message");
        std::wcout << L"      [ERRO] " << std::wstring(message.begin(), message.end()) << std::endl;
        std::wcout << std::endl;
        std::wcout << L"      HWID não registrado no sistema!" << std::endl;
        std::wcout << L"      Faça login pelo Loader principal primeiro." << std::endl;
        return;
    }

    std::string username = GetJsonValue(userResponse, "username");
    std::wcout << L"      ✓ Username: " << std::wstring(username.begin(), username.end()) << std::endl;
    std::wcout << std::endl;

    // Passo 3: Obter Expiry
    std::wcout << L"[3/3] Buscando informações de expiração..." << std::endl;
    
    std::wstring getExpiryPath = L"/auth/get-expiry/" + APP_ID + L"/" + hwid + L"?appSecret=" + UrlEncode(APP_SECRET);
    std::string expiryResponse = HttpGet(getExpiryPath);

    if (expiryResponse.empty()) {
        std::wcerr << L"      [ERRO] Falha ao obter resposta do servidor" << std::endl;
        return;
    }

    success = GetJsonBool(expiryResponse, "success");
    
    if (!success) {
        std::string message = GetJsonValue(expiryResponse, "message");
        std::wcout << L"      [ERRO] " << std::wstring(message.begin(), message.end()) << std::endl;
        return;
    }

    std::string expiresAt = GetJsonValue(expiryResponse, "expires_at");
    std::string daysRemaining = GetJsonValue(expiryResponse, "days_remaining");
    std::string isExpired = GetJsonValue(expiryResponse, "is_expired");
    std::string level = GetJsonValue(expiryResponse, "level");

    std::wcout << L"      ✓ Expira em: " << std::wstring(expiresAt.begin(), expiresAt.end()) << std::endl;
    std::wcout << L"      ✓ Dias restantes: " << std::wstring(daysRemaining.begin(), daysRemaining.end()) << std::endl;
    std::wcout << L"      ✓ Level: " << std::wstring(level.begin(), level.end()) << std::endl;
    std::wcout << L"      ✓ Status: " << (isExpired == "true" ? L"EXPIRADO" : L"ATIVO") << std::endl;
    std::wcout << std::endl;

    // Exibir resumo final
    std::wcout << L"================================================" << std::endl;
    std::wcout << L"           INFORMAÇÕES CARREGADAS!" << std::endl;
    std::wcout << L"================================================" << std::endl;
    std::wcout << L"  Usuário: " << std::wstring(username.begin(), username.end()) << std::endl;
    std::wcout << L"  Dias restantes: " << std::wstring(daysRemaining.begin(), daysRemaining.end()) << std::endl;
    std::wcout << L"  Level: " << std::wstring(level.begin(), level.end()) << std::endl;
    std::wcout << L"================================================" << std::endl;
}

// ==================================================
// MAIN
// ==================================================
int main() {
    // Configurar console para UTF-16
    _setmode(_fileno(stdout), _O_U16TEXT);
    _setmode(_fileno(stderr), _O_U16TEXT);

    SetConsoleTitleW(L"Scarlet Menu - User Info");

    std::wcout << std::endl;
    std::wcout << L"⚠️  IMPORTANTE: Configure SERVER_HOST, APP_ID e APP_SECRET" << std::endl;
    std::wcout << L"   no código antes de compilar!" << std::endl;
    std::wcout << std::endl;

    GetUserInfo();

    std::wcout << std::endl;
    std::wcout << L"Pressione ENTER para sair...";
    std::wcin.get();

    return 0;
}
