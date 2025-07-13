// jack-bridge/include/types.hpp
// Common type definitions for JACK Bridge Service

#pragma once

#include <string>
#include <vector>
#include <chrono>
#include <memory>

// Forward declarations
class ConfigManager;
class JackController;

// Basic JACK types
struct JackConnection {
    std::string from;
    std::string to;
    std::chrono::system_clock::time_point timestamp;
    
    JackConnection() = default;
    JackConnection(const std::string& f, const std::string& t) 
        : from(f), to(t), timestamp(std::chrono::system_clock::now()) {}
};

struct JackPort {
    std::string name;
    std::string type;        // "audio", "midi"
    std::string direction;   // "input", "output"
    std::string client;      // Client name (e.g., "system")
    bool is_active;
    std::chrono::system_clock::time_point last_seen;
    
    JackPort() : is_active(false), last_seen(std::chrono::system_clock::now()) {}
    JackPort(const std::string& n, const std::string& t, const std::string& d) 
        : name(n), type(t), direction(d), is_active(true), 
          last_seen(std::chrono::system_clock::now()) {}
};

struct JackStatus {
    bool server_running;
    std::vector<JackPort> ports;
    std::vector<JackConnection> connections;
    std::chrono::system_clock::time_point last_update;
    std::string error_message;
    
    JackStatus() : server_running(false), last_update(std::chrono::system_clock::now()) {}
};

// WebSocket message types
enum class WebSocketMessageType {
    STATUS_UPDATE,
    CONNECTION_CHANGE,
    PORT_CHANGE,
    ERROR_MESSAGE,
    PING,
    PONG
};

struct WebSocketMessage {
    WebSocketMessageType type;
    std::string data;
    std::chrono::system_clock::time_point timestamp;
    
    WebSocketMessage(WebSocketMessageType t, const std::string& d) 
        : type(t), data(d), timestamp(std::chrono::system_clock::now()) {}
};

// Configuration structures
struct ServerConfig {
    int api_port = 6666;
    int websocket_port = 6667;
    std::string host = "0.0.0.0";
    int max_connections = 100;
    int timeout_seconds = 30;
};

struct JackConfig {
    std::string windows_host = "host.docker.internal";
    std::string tools_path = "C:/PROGRA~1/JACK2/tools";
    int timeout_ms = 10000;
    int reconnect_interval_ms = 5000;
    int monitor_interval_ms = 1000;
    bool auto_reconnect = true;
};

struct LoggingConfig {
    std::string level = "info";
    bool file_enabled = true;
    std::string file_path = "/app/logs/jack-bridge.log";
    bool console_enabled = true;
    int max_file_size_mb = 10;
    int max_files = 5;
};

struct FeatureConfig {
    bool auto_reconnect = true;
    bool connection_monitoring = true;
    bool state_persistence = true;
    bool websocket_updates = true;
    bool health_monitoring = true;
};

// HTTP response structures
struct ApiResponse {
    bool success;
    std::string message;
    std::string error;
    std::chrono::system_clock::time_point timestamp;
    
    ApiResponse(bool s = true, const std::string& m = "", const std::string& e = "") 
        : success(s), message(m), error(e), timestamp(std::chrono::system_clock::now()) {}
};

struct ConnectionResponse : public ApiResponse {
    std::string method;
    bool already_connected = false;
    
    ConnectionResponse(bool s, const std::string& m, const std::string& method_name = "") 
        : ApiResponse(s, m), method(method_name) {}
};

struct StatusResponse : public ApiResponse {
    JackStatus jack_status;
    bool bridge_healthy = true;
    
    StatusResponse(bool s, const JackStatus& status) 
        : ApiResponse(s), jack_status(status) {}
};

// Utility functions
namespace jack_utils {
    std::string extractClientName(const std::string& port_name);
    bool isAudioPort(const std::string& port_name);
    bool isMidiPort(const std::string& port_name);
    std::string formatTimestamp(const std::chrono::system_clock::time_point& time);
    std::string generateConnectionId(const std::string& from, const std::string& to);
}

// Error codes
enum class JackErrorCode {
    SUCCESS = 0,
    SERVER_NOT_RUNNING = 1,
    CONNECTION_FAILED = 2,
    PORT_NOT_FOUND = 3,
    ALREADY_CONNECTED = 4,
    NOT_CONNECTED = 5,
    TIMEOUT = 6,
    INVALID_PARAMETER = 7,
    PERMISSION_DENIED = 8,
    UNKNOWN_ERROR = 999
};

// Exception types
class JackBridgeException : public std::exception {
private:
    std::string message_;
    JackErrorCode error_code_;
    
public:
    JackBridgeException(const std::string& message, JackErrorCode code = JackErrorCode::UNKNOWN_ERROR)
        : message_(message), error_code_(code) {}
    
    const char* what() const noexcept override {
        return message_.c_str();
    }
    
    JackErrorCode getErrorCode() const { return error_code_; }
};

// Constants
namespace jack_constants {
    const int DEFAULT_API_PORT = 6666;
    const int DEFAULT_WS_PORT = 6667;
    const int DEFAULT_TIMEOUT_MS = 10000;
    const int DEFAULT_RECONNECT_INTERVAL_MS = 5000;
    const int DEFAULT_MONITOR_INTERVAL_MS = 1000;
    const std::string DEFAULT_JACK_TOOLS_PATH = "C:/PROGRA~1/JACK2/tools";
    const std::string DEFAULT_WINDOWS_HOST = "host.docker.internal";
    const std::string DEFAULT_LOG_LEVEL = "info";
}