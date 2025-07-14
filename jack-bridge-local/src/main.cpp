// jack-bridge-local/src/main.cpp
// Local Windows C++ JACK Bridge Service

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
#include <fstream>

// Windows includes
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

// JACK includes
extern "C" {
    #include <jack/jack.h>
    #include <jack/types.h>
}

// Link required libraries
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "wsock32.lib")

// Configuration
struct Config {
    int apiPort = 6666;
    std::string logFile = "jack-bridge.log";
    bool enableLogging = true;
    bool verbose = false;
};

// Global variables
jack_client_t* g_jackClient = nullptr;
std::atomic<bool> g_jackRunning{false};
std::atomic<bool> g_serviceRunning{true};
std::mutex g_jackMutex;
Config g_config;
std::ofstream g_logFile;

// Forward declarations
class HttpServer;
std::unique_ptr<HttpServer> g_server;

// Logging utility
void logMessage(const std::string& level, const std::string& message) {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;
    
    char timestamp[64];
    struct tm tm_buf;
    if (localtime_s(&tm_buf, &time_t) == 0) {
        strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", &tm_buf);
    } else {
        strcpy_s(timestamp, "????-??-?? ??:??:??");
    }
    
    std::string logLine = "[" + std::string(timestamp) + "." + 
                         std::to_string(ms.count()) + "] " + level + ": " + message;
    
    // Console output
    std::cout << logLine << std::endl;
    
    // File output
    if (g_config.enableLogging && g_logFile.is_open()) {
        g_logFile << logLine << std::endl;
        g_logFile.flush();
    }
}

#define LOG_INFO(msg) logMessage("INFO", msg)
#define LOG_WARN(msg) logMessage("WARN", msg)
#define LOG_ERROR(msg) logMessage("ERROR", msg)
#define LOG_DEBUG(msg) if(g_config.verbose) logMessage("DEBUG", msg)

// JACK callback functions
int jackProcessCallback(jack_nframes_t nframes, void* arg) {
    return 0; // Minimal process callback
}

void jackShutdownCallback(void* arg) {
    LOG_WARN("JACK server shutdown detected");
    g_jackRunning = false;
}

// JACK connection management
class JackManager {
public:
    bool initialize() {
        std::lock_guard<std::mutex> lock(g_jackMutex);
        
        if (g_jackClient) {
            return true; // Already initialized
        }
        
        jack_status_t status;
        g_jackClient = jack_client_open("jack-bridge-local", JackNoStartServer, &status);
        
        if (!g_jackClient) {
            LOG_ERROR("Failed to connect to JACK server");
            return false;
        }
        
        // Set callbacks
        jack_set_process_callback(g_jackClient, jackProcessCallback, nullptr);
        jack_on_shutdown(g_jackClient, jackShutdownCallback, nullptr);
        
        // Activate client
        if (jack_activate(g_jackClient) != 0) {
            jack_client_close(g_jackClient);
            g_jackClient = nullptr;
            LOG_ERROR("Failed to activate JACK client");
            return false;
        }
        
        g_jackRunning = true;
        LOG_INFO("JACK client activated successfully");
        return true;
    }
    
    void shutdown() {
        std::lock_guard<std::mutex> lock(g_jackMutex);
        
        if (g_jackClient) {
            jack_client_close(g_jackClient);
            g_jackClient = nullptr;
            g_jackRunning = false;
            LOG_INFO("JACK client closed");
        }
    }
    
    bool isRunning() {
        std::lock_guard<std::mutex> lock(g_jackMutex);
        
        if (!g_jackClient) {
            return false;
        }
        
        // Test JACK responsiveness
        try {
            jack_nframes_t sr = jack_get_sample_rate(g_jackClient);
            g_jackRunning = (sr > 0);
            return g_jackRunning;
        } catch (...) {
            g_jackRunning = false;
            return false;
        }
    }
    
    std::vector<std::string> getPorts() {
        std::lock_guard<std::mutex> lock(g_jackMutex);
        std::vector<std::string> ports;
        
        if (!g_jackClient) return ports;
        
        const char** jackPorts = jack_get_ports(g_jackClient, nullptr, nullptr, 0);
        if (jackPorts) {
            for (int i = 0; jackPorts[i]; i++) {
                ports.push_back(std::string(jackPorts[i]));
            }
            jack_free(jackPorts);
        }
        
        return ports;
    }
    
    std::vector<std::pair<std::string, std::string>> getConnections() {
        std::lock_guard<std::mutex> lock(g_jackMutex);
        std::vector<std::pair<std::string, std::string>> connections;
        
        if (!g_jackClient) return connections;
        
        const char** outputPorts = jack_get_ports(g_jackClient, nullptr, nullptr, JackPortIsOutput);
        if (!outputPorts) return connections;
        
        for (int i = 0; outputPorts[i]; i++) {
            jack_port_t* port = jack_port_by_name(g_jackClient, outputPorts[i]);
            if (!port) continue;
            
            const char** connectedPorts = jack_port_get_all_connections(g_jackClient, port);
            if (!connectedPorts) continue;
            
            for (int j = 0; connectedPorts[j]; j++) {
                connections.emplace_back(outputPorts[i], connectedPorts[j]);
            }
            jack_free(connectedPorts);
        }
        jack_free(outputPorts);
        
        return connections;
    }
    
    bool connectPorts(const std::string& from, const std::string& to) {
        std::lock_guard<std::mutex> lock(g_jackMutex);
        
        if (!g_jackClient) {
            LOG_ERROR("JACK client not available for connection");
            return false;
        }
        
        int result = jack_connect(g_jackClient, from.c_str(), to.c_str());
        
        if (result == 0) {
            LOG_INFO("Connected: " + from + " -> " + to);
            return true;
        } else if (result == EEXIST) {
            LOG_DEBUG("Connection already exists: " + from + " -> " + to);
            return true; // Consider already connected as success
        } else {
            LOG_ERROR("Failed to connect: " + from + " -> " + to);
            return false;
        }
    }
    
    bool disconnectPorts(const std::string& from, const std::string& to) {
        std::lock_guard<std::mutex> lock(g_jackMutex);
        
        if (!g_jackClient) {
            LOG_ERROR("JACK client not available for disconnection");
            return false;
        }
        
        int result = jack_disconnect(g_jackClient, from.c_str(), to.c_str());
        
        if (result == 0) {
            LOG_INFO("Disconnected: " + from + " -> " + to);
            return true;
        } else {
            LOG_ERROR("Failed to disconnect: " + from + " -> " + to);
            return false;
        }
    }
    
    int clearAllConnections() {
        std::lock_guard<std::mutex> lock(g_jackMutex);
        
        if (!g_jackClient) return 0;
        
        auto connections = getConnections();
        int cleared = 0;
        
        for (const auto& conn : connections) {
            if (jack_disconnect(g_jackClient, conn.first.c_str(), conn.second.c_str()) == 0) {
                cleared++;
            }
        }
        
        LOG_INFO("Cleared " + std::to_string(cleared) + " connections");
        return cleared;
    }
    
    std::string getJackInfo() {
        std::lock_guard<std::mutex> lock(g_jackMutex);
        
        if (!g_jackClient) return "{}";
        
        std::ostringstream info;
        info << "{"
             << "\"sample_rate\":" << jack_get_sample_rate(g_jackClient) << ","
             << "\"buffer_size\":" << jack_get_buffer_size(g_jackClient) << ","
             << "\"client_name\":\"" << jack_get_client_name(g_jackClient) << "\""
             << "}";
        
        return info.str();
    }
};

// HTTP Server for API
class HttpServer {
private:
    SOCKET serverSocket;
    int port;
    std::atomic<bool> running{false};
    std::thread serverThread;
    JackManager* jackManager;
    
public:
    HttpServer(int p, JackManager* jm) : port(p), jackManager(jm), serverSocket(INVALID_SOCKET) {}
    
    ~HttpServer() {
        stop();
    }
    
    bool start() {
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            LOG_ERROR("WSAStartup failed");
            return false;
        }
        
        serverSocket = socket(AF_INET, SOCK_STREAM, 0);
        if (serverSocket == INVALID_SOCKET) {
            LOG_ERROR("Socket creation failed");
            WSACleanup();
            return false;
        }
        
        // Allow socket reuse
        int opt = 1;
        setsockopt(serverSocket, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt));
        
        struct sockaddr_in address;
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = INADDR_ANY;
        address.sin_port = htons(static_cast<u_short>(port));
        
        if (bind(serverSocket, (struct sockaddr*)&address, sizeof(address)) < 0) {
            LOG_ERROR("Bind failed on port " + std::to_string(port));
            closesocket(serverSocket);
            WSACleanup();
            return false;
        }
        
        if (listen(serverSocket, 3) < 0) {
            LOG_ERROR("Listen failed");
            closesocket(serverSocket);
            WSACleanup();
            return false;
        }
        
        running = true;
        serverThread = std::thread(&HttpServer::serverLoop, this);
        
        LOG_INFO("HTTP Server listening on port " + std::to_string(port));
        return true;
    }
    
    void stop() {
        running = false;
        
        if (serverSocket != INVALID_SOCKET) {
            closesocket(serverSocket);
            serverSocket = INVALID_SOCKET;
        }
        
        if (serverThread.joinable()) {
            serverThread.join();
        }
        
        WSACleanup();
        LOG_INFO("HTTP Server stopped");
    }
    
private:
    void serverLoop() {
        while (running) {
            struct sockaddr_in clientAddr;
            int clientLen = sizeof(clientAddr);
            
            SOCKET clientSocket = accept(serverSocket, (struct sockaddr*)&clientAddr, &clientLen);
            if (clientSocket == INVALID_SOCKET) {
                if (running) {
                    LOG_ERROR("Accept failed");
                }
                continue;
            }
            
            std::thread(&HttpServer::handleClient, this, clientSocket).detach();
        }
    }
    
    void handleClient(SOCKET clientSocket) {
        char buffer[4096] = {0};
        int bytesRead = recv(clientSocket, buffer, sizeof(buffer) - 1, 0);
        
        if (bytesRead <= 0) {
            closesocket(clientSocket);
            return;
        }
        
        std::string request(buffer, bytesRead);
        std::string response = processRequest(request);
        
        send(clientSocket, response.c_str(), static_cast<int>(response.length()), 0);
        closesocket(clientSocket);
    }
    
    std::string processRequest(const std::string& request) {
        std::istringstream iss(request);
        std::string method, path, version;
        iss >> method >> path >> version;
        
        LOG_DEBUG("Request: " + method + " " + path);
        
        std::string responseBody;
        std::string contentType = "application/json";
        
        // CORS headers
        std::string corsHeaders = 
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type\r\n";
        
        try {
            if (method == "OPTIONS") {
                responseBody = "";
            } else if (path == "/health") {
                responseBody = getHealthStatus();
            } else if (path == "/status") {
                responseBody = getJackStatus();
            } else if (path == "/ports") {
                responseBody = getJackPorts();
            } else if (path == "/connections") {
                responseBody = getJackConnections();
            } else if (path == "/connect" && method == "POST") {
                responseBody = handleConnect(request);
            } else if (path == "/disconnect" && method == "POST") {
                responseBody = handleDisconnect(request);
            } else if (path == "/clear" && method == "POST") {
                responseBody = handleClearAll();
            } else {
                responseBody = "{\"error\":\"Not found\",\"path\":\"" + path + "\"}";
            }
        } catch (const std::exception& e) {
            responseBody = "{\"error\":\"Internal server error\",\"message\":\"" + std::string(e.what()) + "\"}";
        }
        
        std::string httpResponse = 
            "HTTP/1.1 200 OK\r\n" +
            corsHeaders +
            "Content-Type: " + contentType + "\r\n"
            "Content-Length: " + std::to_string(responseBody.length()) + "\r\n"
            "\r\n" +
            responseBody;
        
        return httpResponse;
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
        
        return std::string(buffer) + "." + std::to_string(ms.count()) + "Z";
    }
    
    std::string getHealthStatus() {
        bool jackOk = jackManager->isRunning();
        
        return "{\"status\":\"" + std::string(jackOk ? "healthy" : "unhealthy") + "\","
               "\"service\":\"jack-bridge-local\","
               "\"version\":\"1.0.0\","
               "\"jack_running\":" + (jackOk ? "true" : "false") + ","
               "\"platform\":\"windows\","
               "\"api\":\"native\","
               "\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
    }
    
    std::string getJackStatus() {
        bool jackOk = jackManager->isRunning();
        
        std::string response = "{\"success\":" + std::string(jackOk ? "true" : "false") +
                              ",\"jack_running\":" + std::string(jackOk ? "true" : "false") +
                              ",\"method\":\"native_api\"";
        
        if (jackOk) {
            response += "," + jackManager->getJackInfo().substr(1, jackManager->getJackInfo().length() - 2);
        }
        
        response += ",\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
        return response;
    }
    
    std::string getJackPorts() {
        if (!jackManager->isRunning()) {
            return "{\"success\":false,\"error\":\"JACK not running\"}";
        }
        
        auto ports = jackManager->getPorts();
        
        std::string portsJson = "[";
        for (size_t i = 0; i < ports.size(); i++) {
            portsJson += "\"" + ports[i] + "\"";
            if (i < ports.size() - 1) portsJson += ",";
        }
        portsJson += "]";
        
        return "{\"success\":true,"
               "\"ports\":" + portsJson + ","
               "\"count\":" + std::to_string(ports.size()) + ","
               "\"method\":\"native_api\","
               "\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
    }
    
    std::string getJackConnections() {
        if (!jackManager->isRunning()) {
            return "{\"success\":false,\"error\":\"JACK not running\"}";
        }
        
        auto connections = jackManager->getConnections();
        
        std::string connectionsJson = "[";
        for (size_t i = 0; i < connections.size(); i++) {
            connectionsJson += "{\"from\":\"" + connections[i].first + "\","
                              "\"to\":\"" + connections[i].second + "\"}";
            if (i < connections.size() - 1) connectionsJson += ",";
        }
        connectionsJson += "]";
        
        return "{\"success\":true,"
               "\"connections\":" + connectionsJson + ","
               "\"count\":" + std::to_string(connections.size()) + ","
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
    
    std::string handleConnect(const std::string& request) {
        auto bodyStart = request.find("\r\n\r\n");
        if (bodyStart == std::string::npos) {
            return "{\"success\":false,\"error\":\"No request body\"}";
        }
        
        std::string body = request.substr(bodyStart + 4);
        std::string source = extractJsonValue(body, "source");
        std::string destination = extractJsonValue(body, "destination");
        
        if (source.empty() || destination.empty()) {
            return "{\"success\":false,\"error\":\"Missing source or destination\"}";
        }
        
        if (!jackManager->isRunning()) {
            return "{\"success\":false,\"error\":\"JACK not running\"}";
        }
        
        bool success = jackManager->connectPorts(source, destination);
        
        return "{\"success\":" + std::string(success ? "true" : "false") + ","
               "\"message\":\"" + (success ? "Connected" : "Failed") + "\","
               "\"method\":\"native_api\","
               "\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
    }
    
    std::string handleDisconnect(const std::string& request) {
        auto bodyStart = request.find("\r\n\r\n");
        if (bodyStart == std::string::npos) {
            return "{\"success\":false,\"error\":\"No request body\"}";
        }
        
        std::string body = request.substr(bodyStart + 4);
        std::string source = extractJsonValue(body, "source");
        std::string destination = extractJsonValue(body, "destination");
        
        if (source.empty() || destination.empty()) {
            return "{\"success\":false,\"error\":\"Missing source or destination\"}";
        }
        
        if (!jackManager->isRunning()) {
            return "{\"success\":false,\"error\":\"JACK not running\"}";
        }
        
        bool success = jackManager->disconnectPorts(source, destination);
        
        return "{\"success\":" + std::string(success ? "true" : "false") + ","
               "\"message\":\"" + (success ? "Disconnected" : "Failed") + "\","
               "\"method\":\"native_api\","
               "\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
    }
    
    std::string handleClearAll() {
        if (!jackManager->isRunning()) {
            return "{\"success\":false,\"error\":\"JACK not running\"}";
        }
        
        int cleared = jackManager->clearAllConnections();
        
        return "{\"success\":true,"
               "\"message\":\"Cleared all connections\","
               "\"count\":" + std::to_string(cleared) + ","
               "\"method\":\"native_api\","
               "\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
    }
};

// Signal handler
BOOL WINAPI consoleHandler(DWORD signal) {
    if (signal == CTRL_C_EVENT || signal == CTRL_CLOSE_EVENT) {
        LOG_INFO("Received shutdown signal, stopping services...");
        g_serviceRunning = false;
        
        if (g_server) {
            g_server->stop();
        }
        
        return TRUE;
    }
    return FALSE;
}

// Load configuration from file or environment
void loadConfiguration() {
    // Default configuration
    g_config.apiPort = 6666;
    g_config.logFile = "jack-bridge.log";
    g_config.enableLogging = true;
    g_config.verbose = false;
    
    // Override from environment variables
    const char* portEnv = std::getenv("JACK_BRIDGE_PORT");
    if (portEnv) {
        g_config.apiPort = std::atoi(portEnv);
    }
    
    const char* logFileEnv = std::getenv("JACK_BRIDGE_LOG_FILE");
    if (logFileEnv) {
        g_config.logFile = logFileEnv;
    }
    
    const char* verboseEnv = std::getenv("JACK_BRIDGE_VERBOSE");
    if (verboseEnv && std::string(verboseEnv) == "true") {
        g_config.verbose = true;
    }
    
    // Try to load from config file
    std::ifstream configFile("jack-bridge.conf");
    if (configFile.is_open()) {
        std::string line;
        while (std::getline(configFile, line)) {
            if (line.find("port=") == 0) {
                g_config.apiPort = std::stoi(line.substr(5));
            } else if (line.find("log_file=") == 0) {
                g_config.logFile = line.substr(9);
            } else if (line.find("verbose=") == 0) {
                g_config.verbose = (line.substr(8) == "true");
            }
        }
        configFile.close();
    }
}

// Main function
int main(int argc, char* argv[]) {
    // Parse command line arguments
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--port" && i + 1 < argc) {
            g_config.apiPort = std::atoi(argv[++i]);
        } else if (arg == "--verbose") {
            g_config.verbose = true;
        } else if (arg == "--log-file" && i + 1 < argc) {
            g_config.logFile = argv[++i];
        } else if (arg == "--help") {
            std::cout << "JACK Audio Bridge - Local Windows Service\n"
                      << "Usage: " << argv[0] << " [options]\n"
                      << "Options:\n"
                      << "  --port <port>       API port (default: 6666)\n"
                      << "  --verbose           Enable verbose logging\n"
                      << "  --log-file <file>   Log file path\n"
                      << "  --help              Show this help\n";
            return 0;
        }
    }
    
    loadConfiguration();
    
    // Initialize logging
    if (g_config.enableLogging) {
        g_logFile.open(g_config.logFile, std::ios::app);
        if (!g_logFile.is_open()) {
            std::cerr << "Warning: Could not open log file: " << g_config.logFile << std::endl;
        }
    }
    
    LOG_INFO("=================================================================");
    LOG_INFO("JACK Audio Bridge - Local Windows Service Starting");
    LOG_INFO("=================================================================");
    LOG_INFO("Configuration:");
    LOG_INFO("  API Port: " + std::to_string(g_config.apiPort));
    LOG_INFO("  Log File: " + g_config.logFile);
    LOG_INFO("  Verbose: " + std::string(g_config.verbose ? "enabled" : "disabled"));
    LOG_INFO("=================================================================");
    
    // Setup signal handlers
    SetConsoleCtrlHandler(consoleHandler, TRUE);
    
    // Initialize JACK manager
    JackManager jackManager;
    
    // Try to connect to JACK
    LOG_INFO("Attempting to connect to JACK server...");
    if (!jackManager.initialize()) {
        LOG_WARN("Initial JACK connection failed - will retry periodically");
    }
    
    // Create and start HTTP server
    g_server = std::make_unique<HttpServer>(g_config.apiPort, &jackManager);
    
    if (!g_server->start()) {
        LOG_ERROR("Failed to start HTTP server");
        return 1;
    }
    
    LOG_INFO("=================================================================");
    LOG_INFO("JACK Audio Bridge Service Ready");
    LOG_INFO("  HTTP API: http://localhost:" + std::to_string(g_config.apiPort));
    LOG_INFO("  Health Check: http://localhost:" + std::to_string(g_config.apiPort) + "/health");
    LOG_INFO("  JACK Status: http://localhost:" + std::to_string(g_config.apiPort) + "/status");
    LOG_INFO("=================================================================");
    
    // Main service loop
    int statusCheckCounter = 0;
    while (g_serviceRunning) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        
        // Periodic status check and JACK reconnection
        if (++statusCheckCounter >= 30) { // Every 30 seconds
            statusCheckCounter = 0;
            
            bool jackStatus = jackManager.isRunning();
            
            if (!jackStatus) {
                LOG_DEBUG("JACK not running, attempting reconnection...");
                jackManager.shutdown();
                if (jackManager.initialize()) {
                    LOG_INFO("JACK reconnection successful");
                } else {
                    LOG_DEBUG("JACK reconnection failed - will retry");
                }
            } else {
                LOG_DEBUG("JACK status: OK");
            }
        }
    }
    
    LOG_INFO("Service shutting down...");
    
    // Cleanup
    if (g_server) {
        g_server->stop();
        g_server.reset();
    }
    
    jackManager.shutdown();
    
    if (g_logFile.is_open()) {
        g_logFile.close();
    }
    
    LOG_INFO("JACK Audio Bridge Service stopped");
    return 0;
}