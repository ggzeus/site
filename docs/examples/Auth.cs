using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Management;
using Newtonsoft.Json.Linq;

namespace ScarletAuthLoader
{
    class Program
    {
        // --- CONFIG ---
        const string APP_NAME = "MyApp";
        const string APP_VERSION = "1.0";
        const string OWNER_ID = "YOUR_OWNER_ID";
        const string APP_SECRET = "YOUR_APP_SECRET";
        const string API_URL = "http://localhost";

        static string sessionId = "";
        static HttpClient client = new HttpClient();

        static async Task<bool> InitializeAuth()
        {
            Console.WriteLine("[*] Initializing authentication...");

            var payload = new
            {
                name = APP_NAME,
                ownerId = OWNER_ID,
                secret = APP_SECRET,
                version = APP_VERSION
            };

            var json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            try
            {
                var response = await client.PostAsync($"{API_URL}/auth/init", content);
                var responseBody = await response.Content.ReadAsStringAsync();
                var data = JObject.Parse(responseBody);

                if (data["success"]?.Value<bool>() == true)
                {
                    sessionId = data["session_id"]?.Value<string>();
                    Console.WriteLine($"[+] Session initialized: {sessionId.Substring(0, 8)}...");
                    return true;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[-] Error: {ex.Message}");
            }

            return false;
        }

        static async Task<bool> Login(string username, string password)
        {
            Console.WriteLine($"[*] Logging in as {username}...");

            var payload = new
            {
                username = username,
                password = password,
                session_id = sessionId,
                hwid = GetHWID(),
                appId = "YOUR_APP_ID"
            };

            var json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            try
            {
                var response = await client.PostAsync($"{API_URL}/auth/login", content);
                var responseBody = await response.Content.ReadAsStringAsync();
                var data = JObject.Parse(responseBody);

                if (data["success"]?.Value<bool>() == true)
                {
                    Console.WriteLine($"[+] Login successful! Welcome, {username}");
                    return true;
                }
                else
                {
                    Console.WriteLine($"[-] Login failed: {data["message"]}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[-] Error: {ex.Message}");
            }

            return false;
        }

        static string GetHWID()
        {
            try
            {
                string hwid = "";
                ManagementObjectSearcher searcher = new ManagementObjectSearcher("SELECT ProcessorId FROM Win32_Processor");
                foreach (ManagementObject obj in searcher.Get())
                {
                    hwid = obj["ProcessorId"].ToString();
                    break;
                }
                return hwid;
            }
            catch
            {
                return Environment.MachineName + "-" + Environment.UserName;
            }
        }

        static void PrintBanner()
        {
            Console.ForegroundColor = ConsoleColor.Magenta;
            Console.WriteLine(@"
    ╔═══════════════════════════════════════╗
    ║     SCARLET AUTH LOADER v1.0          ║
    ║     Secure Authentication System      ║
    ╚═══════════════════════════════════════╝
            ");
            Console.ResetColor();
        }

        static async Task Main(string[] args)
        {
            PrintBanner();

            if (!await InitializeAuth())
            {
                Console.WriteLine("\n[!] Failed to connect to authentication server.");
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return;
            }

            Console.WriteLine("\n=== Authentication Menu ===");
            Console.WriteLine("1. Login with Username/Password");
            Console.WriteLine("2. Activate License Key");
            Console.Write("Choose option: ");

            int choice = int.Parse(Console.ReadLine());
            bool authenticated = false;

            if (choice == 1)
            {
                Console.Write("\nUsername: ");
                string username = Console.ReadLine();
                Console.Write("Password: ");
                string password = Console.ReadLine();

                authenticated = await Login(username, password);
            }

            if (authenticated)
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("\n╔═══════════════════════════════════════╗");
                Console.WriteLine("║      AUTHENTICATION SUCCESSFUL!       ║");
                Console.WriteLine("╚═══════════════════════════════════════╝\n");
                Console.ResetColor();

                Console.WriteLine("[*] Starting application...");
                await Task.Delay(1000);
                Console.WriteLine("[+] Application loaded successfully!");
                Console.WriteLine($"\n[INFO] Your HWID: {GetHWID()}");
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\n[!] Authentication failed. Access denied.");
                Console.ResetColor();
            }

            Console.WriteLine("\nPress any key to exit...");
            Console.ReadKey();
        }
    }
}

// Requires NuGet package: Newtonsoft.Json
