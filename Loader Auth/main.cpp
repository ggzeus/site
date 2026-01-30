#include <iostream>
#include <string>
#include <windows.h>
#include <wininet.h>
#include <sstream>
#include <ctime>

#pragma comment(lib, "wininet.lib")


using namespace std;

// --- CONFIG ---
const string APP_NAME = "Scarlet External";
const string APP_VERSION = "1.0";
const string OWNER_ID = "1"; // Your user ID
const string APP_SECRET = "00347ecb6ab1084f15649e13aed2ba1d4e2693a81ba0b97ef3ec79943fd2a0fa"; // Your app secret
const string API_URL = "http://localhost"; // Change to your server URL in production

// --- GLOBALS ---
string sessionId = "";
string appId = "";
string currentUser = "";

// --- HELPER FUNCTIONS ---

string GetHWID() {
    // Simple HWID based on computer name + username
    char computerName[256];
    char userName[256];
    DWORD size = 256;
    
    GetComputerNameA(computerName, &size);
    size = 256;
    GetUserNameA(userName, &size);
    
    string hwid = string(computerName) + "-" + string(userName);
    return hwid;
}

string ExecCommand(const char* cmd) {
    char buffer[128];
    string result = "";
    FILE* pipe = _popen(cmd, "r");
    if (!pipe) return "Unknown";
    while (fgets(buffer, sizeof(buffer), pipe) != NULL) {
        result += buffer;
    }
    _pclose(pipe);
    
    // Clean result (remove newlines and extra spaces)
    string cleanResult = "";
    bool foundContent = false;
    stringstream ss(result);
    string line;
    
    // Skip first line (header) and take the second line (value)
    int lineCount = 0;
    while (getline(ss, line)) {
        if (line.empty() || line.find_first_not_of(" \t\r\n") == string::npos) continue;
        lineCount++;
        if (lineCount == 2) {
            // Trim whitespace
            size_t first = line.find_first_not_of(" \t\r\n");
            size_t last = line.find_last_not_of(" \t\r\n");
            if (first != string::npos && last != string::npos) {
                cleanResult = line.substr(first, (last - first + 1));
            }
            break; 
        }
    }
    
    if (cleanResult.empty()) return "Unknown";
    return cleanResult;
}

string GetGPU() {
    return ExecCommand("wmic path Win32_VideoController get Name");
}

string GetMotherboard() {
    return ExecCommand("wmic path Win32_BaseBoard get Product");
}

string GetCPU() {
    return ExecCommand("wmic path Win32_Processor get Name");
}

string HttpRequest(const string& url, const string& method, const string& postData = "") {
    HINTERNET hInternet = InternetOpenA("ScarletAuthLoader/1.0", INTERNET_OPEN_TYPE_DIRECT, NULL, NULL, 0);
    if (!hInternet) return "";

    // Parse URL
    URL_COMPONENTSA urlComp;
    ZeroMemory(&urlComp, sizeof(urlComp));
    urlComp.dwStructSize = sizeof(urlComp);
    
    char szHostName[256];
    char szUrlPath[1024];
    urlComp.lpszHostName = szHostName;
    urlComp.dwHostNameLength = sizeof(szHostName);
    urlComp.lpszUrlPath = szUrlPath;
    urlComp.dwUrlPathLength = sizeof(szUrlPath);
    
    InternetCrackUrlA(url.c_str(), 0, 0, &urlComp);
    
    HINTERNET hConnect = InternetConnectA(hInternet, szHostName, urlComp.nPort, 
        NULL, NULL, INTERNET_SERVICE_HTTP, 0, 0);
    
    if (!hConnect) {
        InternetCloseHandle(hInternet);
        return "";
    }

    HINTERNET hRequest = HttpOpenRequestA(hConnect, method.c_str(), szUrlPath, 
        NULL, NULL, NULL, INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE, 0);
    
    if (!hRequest) {
        InternetCloseHandle(hConnect);
        InternetCloseHandle(hInternet);
        return "";
    }

    // Send request
    const char* headers = "Content-Type: application/json\r\n";
    BOOL result;
    
    if (method == "POST" && !postData.empty()) {
        result = HttpSendRequestA(hRequest, headers, -1, 
            (LPVOID)postData.c_str(), postData.length());
    } else {
        result = HttpSendRequestA(hRequest, NULL, 0, NULL, 0);
    }

    if (!result) {
        InternetCloseHandle(hRequest);
        InternetCloseHandle(hConnect);
        InternetCloseHandle(hInternet);
        return "";
    }

    // Read response
    char buffer[4096];
    DWORD bytesRead;
    string response = "";

    while (InternetReadFile(hRequest, buffer, sizeof(buffer) - 1, &bytesRead) && bytesRead > 0) {
        buffer[bytesRead] = 0;
        response += buffer;
    }

    InternetCloseHandle(hRequest);
    InternetCloseHandle(hConnect);
    InternetCloseHandle(hInternet);

    return response;
}

bool InitializeAuth() {
    cout << "[*] Initializing authentication..." << endl;
    
    string postData = "{\"name\":\"" + APP_NAME + "\",\"ownerId\":\"" + OWNER_ID + 
                      "\",\"secret\":\"" + APP_SECRET + "\",\"version\":\"" + APP_VERSION + "\"}";
    
    string response = HttpRequest(API_URL + "/auth/init", "POST", postData);
    
    // Parse session_id
    size_t pos = response.find("\"session_id\":\"");
    if (pos != string::npos) {
        pos += 14;
        size_t endPos = response.find("\"", pos);
        sessionId = response.substr(pos, endPos - pos);
        cout << "[+] Session initialized: " << sessionId.substr(0, 8) << "..." << endl;
        
        // Parse appId
        pos = response.find("\"appId\":\"");
        if (pos != string::npos) {
            pos += 9;
            endPos = response.find("\"", pos);
            appId = response.substr(pos, endPos - pos);
            cout << "[+] App ID: " << appId << endl;
        }
        
        return true;
    }
    
    cout << "[-] Failed to initialize. Response: " << response << endl;
    return false;
}

bool Login(const string& username, const string& password) {
    if (sessionId.empty()) {
        cout << "[-] Session not initialized!" << endl;
        return false;
    }

    cout << "[*] Logging in as " << username << "..." << endl;
    
    string hwid = GetHWID();
    string postData = "{\"username\":\"" + username + "\",\"password\":\"" + password + 
                      "\",\"session_id\":\"" + sessionId + "\",\"hwid\":\"" + hwid + 
                      "\",\"appId\":\"" + appId + "\"}";
    
    string response = HttpRequest(API_URL + "/auth/login", "POST", postData);
    
    // Check for success
    if (response.find("\"success\":true") != string::npos) {
        currentUser = username;
        cout << "[+] Login successful! Welcome, " << username << endl;
        return true;
    }
    
    cout << "[-] Login failed. Response: " << response << endl;
    return false;
}

bool CheckLicense(const string& licenseKey) {
    if (sessionId.empty()) {
        cout << "[-] Session not initialized!" << endl;
        return false;
    }

    cout << "[*] Checking license key..." << endl;
    
    string hwid = GetHWID();
    string postData = "{\"key\":\"" + licenseKey + "\",\"session_id\":\"" + sessionId + 
                      "\",\"hwid\":\"" + hwid + "\",\"appId\":\"" + appId + "\"}";
    
    string response = HttpRequest(API_URL + "/auth/license", "POST", postData);
    
    if (response.find("\"success\":true") != string::npos) {
        cout << "[+] License valid!" << endl;
        return true;
    }
    
    cout << "[-] Invalid license. Response: " << response << endl;
    return false;
}

bool SendHWID(const string& licenseKey) {
    if (sessionId.empty() || appId.empty()) {
        cout << "[-] Session not initialized!" << endl;
        return false;
    }
    
    string hwid = GetHWID();
    string postData = "{\"appId\":\"" + appId + "\",\"key\":\"" + licenseKey + 
                      "\",\"hwid\":\"" + hwid + "\",\"session_id\":\"" + sessionId + "\"}";
    
    string response = HttpRequest(API_URL + "/auth/hwid", "POST", postData);
    
    if (response.find("\"success\":true") != string::npos) {
        cout << "[+] HWID sent successfully" << endl;
        return true;
    }
    
    cout << "[-] Failed to send HWID" << endl;
    return false;
}

bool SendComponents(const string& licenseKey) {
    if (sessionId.empty() || appId.empty()) {
        cout << "[-] Session not initialized!" << endl;
        return false;
    }
    
    cout << "[*] Collecting hardware information..." << endl;
    
    string hwid = GetHWID();
    string gpu = GetGPU();
    string mobo = GetMotherboard();
    string cpu = GetCPU();
    
    cout << "[+] GPU: " << gpu << endl;
    cout << "[+] Motherboard: " << mobo << endl;
    cout << "[+] CPU: " << cpu << endl;
    
    string postData = "{\"appId\":\"" + appId + "\",\"key\":\"" + licenseKey + 
                      "\",\"hwid\":\"" + hwid + "\",\"gpu\":\"" + gpu + 
                      "\",\"motherboard\":\"" + mobo + "\",\"cpu\":\"" + cpu + 
                      "\",\"session_id\":\"" + sessionId + "\"}";
    
    string response = HttpRequest(API_URL + "/auth/components", "POST", postData);
    
    if (response.find("\"success\":true") != string::npos) {
        cout << "[+] Hardware components registered successfully" << endl;
        return true;
    }
    
    cout << "[-] Failed to register components" << endl;
    return false;
}

bool SendLoginLog(const string& username_or_key) {
    if (sessionId.empty() || appId.empty()) {
        cout << "[-] Session not initialized!" << endl;
        return false;
    }
    
    string hwid = GetHWID();
    string postData = "{\"appId\":\"" + appId + "\",\"username_or_key\":\"" + username_or_key + 
                      "\",\"hwid\":\"" + hwid + "\",\"session_id\":\"" + sessionId + "\"}";
    
    string response = HttpRequest(API_URL + "/auth/log-login", "POST", postData);
    
    if (response.find("\"success\":true") != string::npos) {
        cout << "[+] Login logged successfully" << endl;
        return true;
    }
    
    cout << "[-] Failed to log login" << endl;
    return false;
}

void SetConsoleColor(int color) {
    SetConsoleTextAttribute(GetStdHandle(STD_OUTPUT_HANDLE), color);
}

void PrintBanner() {
    SetConsoleColor(13); // Magenta
    cout << R"(
    ╔═══════════════════════════════════════╗
    ║     SCARLET AUTH LOADER v1.0          ║
    ║     Secure Authentication System      ║
    ╚═══════════════════════════════════════╝
    )" << endl;
    SetConsoleColor(7); // White
}

int main() {
    PrintBanner();
    
    // Initialize
    if (!InitializeAuth()) {
        cout << "\n[!] Failed to connect to authentication server." << endl;
        cout << "Press any key to exit...";
        cin.get();
        return 1;
    }

    cout << "\n=== Authentication Menu ===" << endl;
    cout << "1. Login with Username/Password" << endl;
    cout << "2. Activate License Key" << endl;
    cout << "Choose option: ";
    
    int choice;
    cin >> choice;
    cin.ignore(); // Clear newline

    bool authenticated = false;
    string licenseKey = ""; // Store for later use

    if (choice == 1) {
        string username, password;
        cout << "\nUsername: ";
        getline(cin, username);
        cout << "Password: ";
        getline(cin, password);
        
        authenticated = Login(username, password);
        if (authenticated) {
            SendLoginLog(username);
        }
    }
    else if (choice == 2) {
        cout << "\nLicense Key: ";
        getline(cin, licenseKey);
        
        authenticated = CheckLicense(licenseKey);
        if (authenticated) {
            SendHWID(licenseKey);
            SendComponents(licenseKey);
            SendLoginLog(licenseKey);
        }
    }
    else {
        cout << "[-] Invalid option!" << endl;
    }

    if (authenticated) {
        SetConsoleColor(10); // Green
        cout << "\n╔═══════════════════════════════════════╗" << endl;
        cout << "║      AUTHENTICATION SUCCESSFUL!       ║" << endl;
        cout << "╚═══════════════════════════════════════╝\n" << endl;
        SetConsoleColor(7);
        
        cout << "[*] Starting application..." << endl;
        Sleep(1000);
        cout << "[+] Application loaded successfully!" << endl;
        
        // Your application logic here
        cout << "\n[INFO] Your HWID: " << GetHWID() << endl;
    }
    else {
        SetConsoleColor(12); // Red
        cout << "\n[!] Authentication failed. Access denied." << endl;
        SetConsoleColor(7);
    }

    cout << "\nPress any key to exit...";
    cin.get();
    return 0;
}
