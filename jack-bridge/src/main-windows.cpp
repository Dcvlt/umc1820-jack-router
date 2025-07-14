// jack-bridge/src/main-windows.cpp
// Fixed C++ JACK Bridge Service for Windows Container with proper headers

#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include <atomic>
#include <vector>
#include <map>
#include <sstream>
#include <memory>
#include <mutex>
#include <regex>
#include <cstdlib>
#include <cstring>
#include <csignal>
#include <iomanip>
#include <ctime>
#include <cstdio>

// Windows-specific includes (must come before JACK)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

// JACK includes (after Windows headers to avoid conflicts)
extern "C" {
    #include <jack/jack.h>
    #include <jack/types.h>
}

// Link required libraries
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "wsock32.lib")
// Note: libjack64.lib will be linked via CMake

// Type definitions for Windows compatibility
typedef int socklen_t;
typedef int ssize_t;

// JACK client handle
jack_client_t* jack_client = nullptr;
std::atomic<bool> jack_running{false};
std::mutex jack_mutex;

// Forward declarations
class JackBridgeServer;

// JACK callback functions
int jack_process_callback(jack_nframes_t nframes, void* arg) {
    // Basic process callback - just to keep JACK happy
    return 0;
}

void jack_shutdown_callback(void* arg) {
    std::cout << "⚠️ JACK server shutdown" << std::endl;
    jack_running = false;
}

// Simple HTTP Server Implementation
class JackBridgeServer {
private:
    int server_fd;
    int port;
    std::atomic<bool> running{false};
    std::thread server_thread;
    
public:
    JackBridgeServer(int p) : port(p), server_fd(INVALID_SOCKET) {}
    
    ~JackBridgeServer() {
        stop();
    }
    
    bool start() {
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            std::cerr << "❌ WSAStartup failed" << std::endl;
            return false;
        }
        
        server_fd = socket(AF_INET, SOCK_STREAM, 0);
        if (server_fd == INVALID_SOCKET) {
            std::cerr << "❌ Socket creation failed: " << WSAGetLastError() << std::endl;
            WSACleanup();
            return false;
        }
        
        // Allow socket reuse
        int opt = 1;
        if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt)) < 0) {
            std::cerr << "❌ Setsockopt failed: " << WSAGetLastError() << std::endl;
            closesocket(server_fd);
            WSACleanup();
            return false;
        }
        
        struct sockaddr_in address;
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = INADDR_ANY;
        address.sin_port = htons(static_cast<u_short>(port));
        
        if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) < 0) {
            std::cerr << "❌ Bind failed on port " << port << ": " << WSAGetLastError() << std::endl;
            closesocket(server_fd);
            WSACleanup();
            return false;
        }
        
        if (listen(server_fd, 3) < 0) {
            std::cerr << "❌ Listen failed: " << WSAGetLastError() << std::endl;
            closesocket(server_fd);
            WSACleanup();
            return false;
        }
        
        running = true;
        server_thread = std::thread(&JackBridgeServer::run, this);
        
        std::cout << "🌐 HTTP Server listening on port " << port << std::endl;
        return true;
    }
    
    void stop() {
        running = false;
        if (server_fd != INVALID_SOCKET) {
            closesocket(server_fd);
            WSACleanup();
            server_fd = INVALID_SOCKET;
        }
        if (server_thread.joinable()) {
            server_thread.join();
        }
    }
    
private:
    void run() {
        while (running) {
            struct sockaddr_in client_addr;
            socklen_t client_len = sizeof(client_addr);
            
            int client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &client_len);
            if (client_fd == INVALID_SOCKET) {
                if (running) {
                    std::cerr << "❌ Accept failed: " << WSAGetLastError() << std::endl;
                }
                continue;
            }
            
            std::thread(&JackBridgeServer::handleRequest, this, client_fd).detach();
        }
    }
    
    void handleRequest(int client_fd) {
        char buffer[4096] = {0};
        ssize_t bytes_read = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
        
        if (bytes_read <= 0) {
            closesocket(client_fd);
            return;
        }
        
        std::string request(buffer, static_cast<size_t>(bytes_read));
        std::string response = processRequest(request);
        
        send(client_fd, response.c_str(), static_cast<int>(response.length()), 0);
        closesocket(client_fd);
    }
    
    std::string processRequest(const std::string& request) {
        // Parse HTTP request
        std::istringstream iss(request);
        std::string method, path, version;
        iss >> method >> path >> version;
        
        std::string response_body;
        std::string content_type = "application/json";
        
        // CORS headers
        std::string cors_headers = 
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type\r\n";
        
        try {
            if (method == "OPTIONS") {
                response_body = "";
            } else if (path == "/health") {
                response_body = getHealthStatus();
            } else if (path == "/status") {
                response_body = getJackStatus();
            } else if (path == "/ports") {
                response_body = getJackPorts();
            } else if (path == "/connections") {
                response_body = getJackConnections();
            } else if (path == "/connect" && method == "POST") {
                response_body = handleConnect(request);
            } else if (path == "/disconnect" && method == "POST") {
                response_body = handleDisconnect(request);
            } else if (path == "/clear" && method == "POST") {
                response_body = handleClearAll();
            } else {
                response_body = "{\"error\":\"Not found\",\"path\":\"" + path + "\"}";
            }
        } catch (const std::exception& e) {
            response_body = "{\"error\":\"Internal server error\",\"message\":\"" + std::string(e.what()) + "\"}";
        }
        
        std::string http_response = 
            "HTTP/1.1 200 OK\r\n" +
            cors_headers +
            "Content-Type: " + content_type + "\r\n"
            "Content-Length: " + std::to_string(response_body.length()) + "\r\n"
            "\r\n" +
            response_body;
        
        return http_response;
    }
    
    std::string getCurrentTimestamp() {
        auto now = std::chrono::system_clock::now();
        auto time_t = std::chrono::system_clock::to_time_t(now);
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()) % 1000;
        
        char buffer[64];
        struct tm tm_buf;
        if (gmtime_s(&tm_buf, &time_t) == 0) {
            strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S", &tm_buf);
        } else {
            strcpy_s(buffer, "1970-01-01T00:00:00");
        }
        
        std::ostringstream oss;
        oss << buffer << "." << std::setfill('0') << std::setw(3) << ms.count() << "Z";
        return oss.str();
    }
    
    std::string getHealthStatus() {
        bool jack_ok = checkJackConnection();
        std::string status = jack_ok ? "healthy" : "unhealthy";
        
        return "{\"status\":\"" + status + "\","
               "\"service\":\"jack-bridge-windows\","
               "\"version\":\"1.0.0\","
               "\"jack_running\":" + (jack_ok ? "true" : "false") + ","
               "\"container\":\"windows\","
               "\"api\":\"native\","
               "\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
    }
    
    bool checkJackConnection() {
        std::lock_guard<std::mutex> lock(jack_mutex);
        
        if (!jack_client) {
            // Try to connect to JACK
            jack_status_t status;
            jack_client = jack_client_open("jack-bridge-health", JackNoStartServer, &status);
            
            if (!jack_client) {
                jack_running = false;
                return false;
            }
            
            // Set callbacks
            jack_set_process_callback(jack_client, jack_process_callback, nullptr);
            jack_on_shutdown(jack_client, jack_shutdown_callback, nullptr);
            
            // Activate client
            if (jack_activate(jack_client) != 0) {
                jack_client_close(jack_client);
                jack_client = nullptr;
                jack_running = false;
                return false;
            }
        }
        
        // Test if JACK is responsive by getting sample rate
        try {
            jack_nframes_t sr = jack_get_sample_rate(jack_client);
            if (sr > 0) {
                jack_running = true;
                return true;
            }
        } catch (...) {
            // JACK is not responsive
        }
        
        jack_running = false;
        return false;
    }
    
    std::string getJackStatus() {
        bool jack_ok = checkJackConnection();
        
        std::ostringstream oss;
        oss << "{\"success\":" << (jack_ok ? "true" : "false")
            << ",\"jack_running\":" << (jack_ok ? "true" : "false")
            << ",\"method\":\"native_api\""
            << ",\"container\":\"windows\"";
        
        if (jack_ok && jack_client) {
            oss << ",\"sample_rate\":" << jack_get_sample_rate(jack_client)
                << ",\"buffer_size\":" << jack_get_buffer_size(jack_client);
        }
        
        oss << ",\"timestamp\":\"" << getCurrentTimestamp() << "\"}";
        return oss.str();
    }
    
    std::string getJackPorts() {
        if (!checkJackConnection()) {
            return "{\"success\":false,\"error\":\"JACK not running\"}";
        }
        
        std::lock_guard<std::mutex> lock(jack_mutex);
        
        const char** ports = jack_get_ports(jack_client, nullptr, nullptr, 0);
        if (!ports) {
            return "{\"success\":false,\"error\":\"No ports found\"}";
        }
        
        std::vector<std::string> port_list;
        for (int i = 0; ports[i]; i++) {
            port_list.push_back("\"" + std::string(ports[i]) + "\"");
        }
        jack_free(ports);
        
        std::string ports_json = "[" + join(port_list, ",") + "]";
        
        return "{\"success\":true,"
               "\"ports\":" + ports_json + ","
               "\"count\":" + std::to_string(port_list.size()) + ","
               "\"method\":\"native_api\","
               "\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
    }
    
    std::string getJackConnections() {
        if (!checkJackConnection()) {
            return "{\"success\":false,\"error\":\"JACK not running\"}";
        }
        
        std::lock_guard<std::mutex> lock(jack_mutex);
        
        const char** ports = jack_get_ports(jack_client, nullptr, nullptr, JackPortIsOutput);
        if (!ports) {
            return "{\"success\":true,\"connections\":[],\"count\":0}";
        }
        
        std::vector<std::string> connections;
        
        for (int i = 0; ports[i]; i++) {
            jack_port_t* port = jack_port_by_name(jack_client, ports[i]);
            if (!port) continue;
            
            const char** connected_ports = jack_port_get_all_connections(jack_client, port);
            if (!connected_ports) continue;
            
            for (int j = 0; connected_ports[j]; j++) {
                connections.push_back(
                    "{\"from\":\"" + std::string(ports[i]) + "\","
                    "\"to\":\"" + std::string(connected_ports[j]) + "\"}"
                );
            }
            jack_free(connected_ports);
        }
        jack_free(ports);
        
        std::string connections_json = "[" + join(connections, ",") + "]";
        
        return "{\"success\":true,"
               "\"connections\":" + connections_json + ","
               "\"count\":" + std::to_string(connections.size()) + ","
               "\"method\":\"native_api\","
               "\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
    }
    
    std::string handleConnect(const std::string& request) {
        auto body_start = request.find("\r\n\r\n");
        if (body_start == std::string::npos) {
            return "{\"success\":false,\"error\":\"No request body\"}";
        }
        
        std::string body = request.substr(body_start + 4);
        std::string source = extractJsonValue(body, "source");
        std::string destination = extractJsonValue(body, "destination");
        
        if (source.empty() || destination.empty()) {
            return "{\"success\":false,\"error\":\"Missing source or destination\"}";
        }
        
        if (!checkJackConnection()) {
            return "{\"success\":false,\"error\":\"JACK not running\"}";
        }
        
        std::lock_guard<std::mutex> lock(jack_mutex);
        
        int result = jack_connect(jack_client, source.c_str(), destination.c_str());
        
        bool success = (result == 0 || result == EEXIST);
        bool already_connected = (result == EEXIST);
        
        return "{\"success\":" + std::string(success ? "true" : "false") + ","
               "\"already_connected\":" + std::string(already_connected ? "true" : "false") + ","
               "\"message\":\"" + (success ? "Connected" : "Failed") + "\","
               "\"method\":\"native_api\","
               "\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
    }
    
    std::string handleDisconnect(const std::string& request) {
        auto body_start = request.find("\r\n\r\n");
        if (body_start == std::string::npos) {
            return "{\"success\":false,\"error\":\"No request body\"}";
        }
        
        std::string body = request.substr(body_start + 4);
        std::string source = extractJsonValue(body, "source");
        std::string destination = extractJsonValue(body, "destination");
        
        if (source.empty() || destination.empty()) {
            return "{\"success\":false,\"error\":\"Missing source or destination\"}";
        }
        
        if (!checkJackConnection()) {
            return "{\"success\":false,\"error\":\"JACK not running\"}";
        }
        
        std::lock_guard<std::mutex> lock(jack_mutex);
        
        int result = jack_disconnect(jack_client, source.c_str(), destination.c_str());
        bool success = (result == 0);
        
        return "{\"success\":" + std::string(success ? "true" : "false") + ","
               "\"message\":\"" + (success ? "Disconnected" : "Failed") + "\","
               "\"method\":\"native_api\","
               "\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
    }
    
    std::string handleClearAll() {
        if (!checkJackConnection()) {
            return "{\"success\":false,\"error\":\"JACK not running\"}";
        }
        
        std::lock_guard<std::mutex> lock(jack_mutex);
        
        // Get all output ports
        const char** output_ports = jack_get_ports(jack_client, nullptr, nullptr, JackPortIsOutput);
        if (!output_ports) {
            return "{\"success\":true,\"message\":\"No connections to clear\",\"count\":0}";
        }
        
        int disconnected = 0;
        
        // Disconnect all connections
        for (int i = 0; output_ports[i]; i++) {
            jack_port_t* port = jack_port_by_name(jack_client, output_ports[i]);
            if (!port) continue;
            
            const char** connected_ports = jack_port_get_all_connections(jack_client, port);
            if (!connected_ports) continue;
            
            for (int j = 0; connected_ports[j]; j++) {
                if (jack_disconnect(jack_client, output_ports[i], connected_ports[j]) == 0) {
                    disconnected++;
                }
            }
            jack_free(connected_ports);
        }
        jack_free(output_ports);
        
        return "{\"success\":true,"
               "\"message\":\"Cleared all connections\","
               "\"count\":" + std::to_string(disconnected) + ","
               "\"method\":\"native_api\","
               "\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
    }
    
    std::string extractJsonValue(const std::string& json, const std::string& key) {
        std::regex pattern("\"" + key + "\"\\s*:\\s*\"([^\"]+)\"");
        std::smatch matches;
        
        if (std::regex_search(json, matches, pattern)) {
            return matches[1].str();
        }
        
        return "";
    }
    
    std::string join(const std::vector<std::string>& vec, const std::string& delimiter) {
        if (vec.empty()) return "";
        
        std::string result = vec[0];
        for (size_t i = 1; i < vec.size(); ++i) {
            result += delimiter + vec[i];
        }
        return result;
    }
};

// Global variables
std::atomic<bool> g_running{true};
std::unique_ptr<JackBridgeServer> g_server;

// Signal handler for Windows
BOOL WINAPI ConsoleHandler(DWORD signal) {
    if (signal == CTRL_C_EVENT || signal == CTRL_CLOSE_EVENT) {
        std::cout << "\n🛑 Received shutdown signal, stopping services..." << std::endl;
        g_running = false;
        
        if (g_server) {
            g_server->stop();
        }
        
        if (jack_client) {
            std::lock_guard<std::mutex> lock(jack_mutex);
            jack_client_close(jack_client);
            jack_client = nullptr;
        }
        
        return TRUE;
    }
    return FALSE;
}

int main() {
    std::cout << "🎵 JACK Bridge Service (Windows Container) Starting..." << std::endl;
    std::cout << "=====================================================" << std::endl;
    
    // Setup signal handlers
    SetConsoleCtrlHandler(ConsoleHandler, TRUE);
    
    // Configuration
    int api_port = 6666;
    
    // Check environment variables
    const char* port_env = std::getenv("JACK_BRIDGE_API_PORT");
    if (port_env) {
        api_port = std::atoi(port_env);
    }
    
    std::cout << "📡 API Port: " << api_port << std::endl;
    std::cout << "🎛️ JACK Connection: Native Windows API" << std::endl;
    std::cout << "🐳 Container: Windows Server Core" << std::endl;
    
    // Wait for JACK to be available
    std::cout << "⏳ Waiting for JACK server..." << std::endl;
    for (int i = 0; i < 30; i++) {
        jack_status_t status;
        jack_client_t* test_client = jack_client_open("jack-bridge-startup", JackNoStartServer, &status);
        
        if (test_client) {
            std::cout << "✅ JACK server is available" << std::endl;
            jack_client_close(test_client);
            break;
        }
        
        if (i == 29) {
            std::cout << "⚠️ JACK server not found after 60 seconds" << std::endl;
            std::cout << "   Continuing anyway - JACK may start later" << std::endl;
            break;
        }
        
        std::this_thread::sleep_for(std::chrono::seconds(2));
        std::cout << "   Attempt " << (i + 1) << "/30..." << std::endl;
    }
    
    // Create and start HTTP server
    g_server = std::make_unique<JackBridgeServer>(api_port);
    
    if (!g_server->start()) {
        std::cerr << "❌ Failed to start HTTP server" << std::endl;
        return 1;
    }
    
    std::cout << "✅ JACK Bridge Service ready" << std::endl;
    std::cout << "   HTTP API: http://0.0.0.0:" << api_port << std::endl;
    std::cout << "   Health: http://0.0.0.0:" << api_port << "/health" << std::endl;
    std::cout << "   Status: http://0.0.0.0:" << api_port << "/status" << std::endl;
    std::cout << "   Container: Windows" << std::endl;
    std::cout << "   JACK API: Native (libjack64)" << std::endl;
    std::cout << "" << std::endl;
    
    // Main service loop
    int counter = 0;
    while (g_running) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
        
        // Health check output every 30 seconds
        if (++counter % 30 == 0) {
            bool jack_ok = false;
            {
                std::lock_guard<std::mutex> lock(jack_mutex);
                jack_ok = jack_running.load();
            }
            
            std::cout << "🔄 Service running... (" << counter << "s) - JACK: " 
                     << (jack_ok ? "✅" : "❌") << std::endl;
        }
    }
    
    std::cout << "🛑 JACK Bridge Service stopped" << std::endl;
    
    // Cleanup
    if (jack_client) {
        std::lock_guard<std::mutex> lock(jack_mutex);
        jack_client_close(jack_client);
        jack_client = nullptr;
    }
    
    return 0;
}