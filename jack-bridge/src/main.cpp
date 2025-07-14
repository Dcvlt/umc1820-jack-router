// jack-bridge/src/main.cpp
// Simplified C++ JACK Bridge Service with Volume Mount Access

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

#ifdef _WIN32
    #include <winsock2.h>
    #include <ws2tcpip.h>
    #include <windows.h>
    #pragma comment(lib, "ws2_32.lib")
    typedef int socklen_t;
    typedef int ssize_t;
#else
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <arpa/inet.h>
    #include <unistd.h>
    #include <sys/wait.h>
#endif

// Simple HTTP Server Implementation
class SimpleHttpServer {
private:
    int server_fd;
    int port;
    std::atomic<bool> running{false};
    std::thread server_thread;
    
public:
    SimpleHttpServer(int p) : port(p), server_fd(-1) {}
    
    ~SimpleHttpServer() {
        stop();
    }
    
    bool start() {
        #ifdef _WIN32
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            std::cerr << "WSAStartup failed" << std::endl;
            return false;
        }
        #endif
        
        server_fd = socket(AF_INET, SOCK_STREAM, 0);
        if (server_fd < 0) {
            std::cerr << "Socket creation failed" << std::endl;
            return false;
        }
        
        int opt = 1;
        #ifdef _WIN32
        if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt)) < 0) {
        #else
        if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR | SO_REUSEPORT, &opt, sizeof(opt)) < 0) {
        #endif
            std::cerr << "Setsockopt failed" << std::endl;
            return false;
        }
        
        struct sockaddr_in address;
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = INADDR_ANY;
        address.sin_port = htons(port);
        
        if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) < 0) {
            std::cerr << "Bind failed on port " << port << std::endl;
            return false;
        }
        
        if (listen(server_fd, 3) < 0) {
            std::cerr << "Listen failed" << std::endl;
            return false;
        }
        
        running = true;
        server_thread = std::thread(&SimpleHttpServer::run, this);
        
        std::cout << "🌐 HTTP Server listening on port " << port << std::endl;
        return true;
    }
    
    void stop() {
        running = false;
        if (server_fd >= 0) {
            #ifdef _WIN32
            closesocket(server_fd);
            WSACleanup();
            #else
            close(server_fd);
            #endif
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
            if (client_fd < 0) {
                if (running) {
                    std::cerr << "Accept failed" << std::endl;
                }
                continue;
            }
            
            std::thread(&SimpleHttpServer::handleRequest, this, client_fd).detach();
        }
    }
    
    void handleRequest(int client_fd) {
        char buffer[4096] = {0};
        ssize_t bytes_read = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
        
        if (bytes_read <= 0) {
            #ifdef _WIN32
            closesocket(client_fd);
            #else
            close(client_fd);
            #endif
            return;
        }
        
        std::string request(buffer, bytes_read);
        std::string response = processRequest(request);
        
        send(client_fd, response.c_str(), response.length(), 0);
        
        #ifdef _WIN32
        closesocket(client_fd);
        #else
        close(client_fd);
        #endif
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
        
        if (method == "OPTIONS") {
            // Handle preflight requests
            response_body = "";
        } else if (path == "/health") {
            response_body = "{\"status\":\"ok\",\"service\":\"jack-bridge-cpp\",\"version\":\"1.0.0\",\"timestamp\":\"" + 
                           getCurrentTimestamp() + "\"}";
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
            response_body = handleClear();
        } else if (path == "/debug") {
            response_body = getDebugInfo();
        } else {
            response_body = "{\"error\":\"Not found\"}";
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
        
        // Use C-style formatting for compatibility
        char buffer[64];
        struct tm* utc_tm = gmtime(&time_t);
        strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S", utc_tm);
        
        std::ostringstream oss;
        oss << buffer << "." << std::setfill('0') << std::setw(3) << ms.count() << "Z";
        return oss.str();
    }
    
    std::string executeCommand(const std::string& command) {
        std::string result;
        char buffer[128];
        
        #ifdef _WIN32
        FILE* pipe = _popen(command.c_str(), "r");
        #else
        FILE* pipe = popen(command.c_str(), "r");
        #endif
        
        if (!pipe) {
            return "COMMAND_FAILED";
        }
        
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        
        #ifdef _WIN32
        int exit_code = _pclose(pipe);
        #else
        int exit_code = pclose(pipe);
        #endif
        
        return result;
    }
    
    std::string getJackStatus() {
        // Use mounted Windows JACK tools
        std::string output = executeCommand("/host/jack-tools/jack_lsp.exe");
        bool jack_running = !output.empty() && 
                           output.find("system:") != std::string::npos &&
                           output.find("error") == std::string::npos;
        
        std::string result = "{\"success\":true,\"jack_running\":";
        result += jack_running ? "true" : "false";
        result += ",\"method\":\"volume_mount\",\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
        
        return result;
    }
    
    std::string getJackPorts() {
        std::string output = executeCommand("/host/jack-tools/jack_lsp.exe");
        
        // Parse ports into JSON array
        std::vector<std::string> ports;
        std::istringstream iss(output);
        std::string line;
        
        while (std::getline(iss, line)) {
            // Remove Windows line endings
            if (!line.empty() && line.back() == '\r') {
                line.pop_back();
            }
            if (!line.empty() && line.find("error") == std::string::npos) {
                ports.push_back("\"" + line + "\"");
            }
        }
        
        std::string ports_json = "[" + join(ports, ",") + "]";
        
        std::string result = "{\"success\":true,\"ports\":" + ports_json + 
                           ",\"count\":" + std::to_string(ports.size()) + 
                           ",\"method\":\"volume_mount\",\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
        
        return result;
    }
    
    std::string getJackConnections() {
        std::string output = executeCommand("/host/jack-tools/jack_lsp.exe -c");
        
        // Parse connections
        std::vector<std::string> connections;
        std::istringstream iss(output);
        std::string line;
        std::string current_source;
        
        while (std::getline(iss, line)) {
            // Remove Windows line endings
            if (!line.empty() && line.back() == '\r') {
                line.pop_back();
            }
            
            if (line.empty()) continue;
            
            if (line[0] != ' ' && line[0] != '\t') {
                current_source = line;
            } else if (!current_source.empty()) {
                std::string destination = line;
                // Remove leading whitespace
                destination.erase(0, destination.find_first_not_of(" \t"));
                
                connections.push_back(
                    "{\"from\":\"" + current_source + "\",\"to\":\"" + destination + "\"}"
                );
            }
        }
        
        std::string connections_json = "[" + join(connections, ",") + "]";
        
        std::string result = "{\"success\":true,\"connections\":" + connections_json + 
                           ",\"count\":" + std::to_string(connections.size()) + 
                           ",\"method\":\"volume_mount\",\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
        
        return result;
    }
    
    std::string handleConnect(const std::string& request) {
        // Extract JSON body from POST request
        auto body_start = request.find("\r\n\r\n");
        if (body_start == std::string::npos) {
            return "{\"success\":false,\"error\":\"No request body\"}";
        }
        
        std::string body = request.substr(body_start + 4);
        
        // Simple JSON parsing (find source and destination)
        std::string source = extractJsonValue(body, "source");
        std::string destination = extractJsonValue(body, "destination");
        
        if (source.empty() || destination.empty()) {
            return "{\"success\":false,\"error\":\"Missing source or destination\"}";
        }
        
        // Use mounted JACK tools to make connection
        std::string command = "/host/jack-tools/jack_connect.exe \"" + source + "\" \"" + destination + "\"";
        std::string output = executeCommand(command);
        
        bool success = output.find("error") == std::string::npos;
        bool already_connected = output.find("already connected") != std::string::npos;
        
        std::string result = "{\"success\":";
        result += success ? "true" : "false";
        result += ",\"already_connected\":";
        result += already_connected ? "true" : "false";
        result += ",\"message\":\"";
        result += success ? "Connected" : "Failed";
        result += "\",\"method\":\"volume_mount\",\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
        
        return result;
    }
    
    std::string handleDisconnect(const std::string& request) {
        // For now, simulate disconnect (jack_disconnect might not be available)
        std::string result = "{\"success\":true,\"message\":\"Disconnect simulated\",\"method\":\"cpp_bridge\",\"timestamp\":\"" + 
                           getCurrentTimestamp() + "\"}";
        return result;
    }
    
    std::string handleClear() {
        // For now, simulate clear all
        std::string result = "{\"success\":true,\"message\":\"Clear all simulated\",\"method\":\"cpp_bridge\",\"timestamp\":\"" + 
                           getCurrentTimestamp() + "\"}";
        return result;
    }
    
    std::string getDebugInfo() {
        std::vector<std::string> commands = {
            "/host/jack-tools/jack_lsp.exe",
            "/host/jack-tools/jack_connect.exe --help",
            "ls -la /host/jack-tools/",
            "whoami",
            "uname -a"
        };
        
        std::string result = "{\"debug_results\":[";
        bool first = true;
        
        for (const auto& command : commands) {
            if (!first) result += ",";
            first = false;
            
            std::string output = executeCommand(command);
            if (output.empty()) output = "NO_OUTPUT";
            
            // Escape quotes in output
            std::string escaped_output;
            for (char c : output) {
                if (c == '"') escaped_output += "\\\"";
                else if (c == '\n') escaped_output += "\\n";
                else if (c == '\r') escaped_output += "\\r";
                else escaped_output += c;
            }
            
            result += "{\"command\":\"" + command + "\",\"output\":\"" + 
                     escaped_output.substr(0, 200) + "\"}";
        }
        
        result += "],\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
        return result;
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
std::unique_ptr<SimpleHttpServer> g_server;

// Signal handler
void signalHandler(int signal) {
    std::cout << "\n🛑 Received signal " << signal << ", shutting down..." << std::endl;
    g_running = false;
    if (g_server) {
        g_server->stop();
    }
}

int main() {
    std::cout << "🎵 JACK Bridge Service (C++) Starting..." << std::endl;
    std::cout << "========================================" << std::endl;
    
    // Setup signal handlers
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);
    
    // Configuration
    int api_port = 6666;
    
    // Check environment variables
    const char* port_env = std::getenv("JACK_BRIDGE_API_PORT");
    if (port_env) {
        api_port = std::atoi(port_env);
    }
    
    std::cout << "📡 API Port: " << api_port << std::endl;
    std::cout << "🎛️ JACK Tools: /host/jack-tools/ (Volume Mount)" << std::endl;
    
    // Create and start HTTP server
    g_server = std::make_unique<SimpleHttpServer>(api_port);
    
    if (!g_server->start()) {
        std::cerr << "❌ Failed to start HTTP server" << std::endl;
        return 1;
    }
    
    std::cout << "✅ JACK Bridge Service ready" << std::endl;
    std::cout << "   HTTP API: http://0.0.0.0:" << api_port << std::endl;
    std::cout << "   Health: http://0.0.0.0:" << api_port << "/health" << std::endl;
    std::cout << "   Debug: http://0.0.0.0:" << api_port << "/debug" << std::endl;
    
    // Main service loop
    while (g_running) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
        
        // Basic health check output every 30 seconds
        static int counter = 0;
        if (++counter % 30 == 0) {
            std::cout << "🔄 Service running... (" << counter << "s)" << std::endl;
        }
    }
    
    std::cout << "🛑 JACK Bridge Service stopped" << std::endl;
    return 0;
}