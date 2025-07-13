// jack-bridge/src/config_manager.cpp
// Basic configuration management implementation

#include "config_manager.hpp"
#include <iostream>
#include <fstream>
#include <sstream>
#include <cstdlib>

ConfigManager::ConfigManager() 
    : config_file_path_("/app/config/config.json"), loaded_(false) {
    loadDefaults();
}

ConfigManager::ConfigManager(const std::string& config_file)
    : config_file_path_(config_file), loaded_(false) {
    loadDefaults();
}

bool ConfigManager::load() {
    return load(config_file_path_);
}

bool ConfigManager::load(const std::string& config_file) {
    config_file_path_ = config_file;
    
    // Load defaults first
    loadDefaults();
    
    // Try to load from file
    std::ifstream file(config_file);
    if (!file.is_open()) {
        std::cout << "Config file not found: " << config_file << ", using defaults" << std::endl;
        loaded_ = true;
        applyEnvironmentOverrides();
        return true;
    }
    
    // For simplicity, we'll do basic parsing without JSON library
    // In a real implementation, you'd use a JSON library
    std::string line;
    while (std::getline(file, line)) {
        // Basic parsing - look for key-value pairs
        if (line.find("api_port") != std::string::npos) {
            size_t pos = line.find(':');
            if (pos != std::string::npos) {
                std::string value = line.substr(pos + 1);
                server_config_.api_port = std::stoi(value);
            }
        }
        // Add more parsing as needed...
    }
    
    loaded_ = true;
    applyEnvironmentOverrides();
    return true;
}

void ConfigManager::loadDefaults() {
    // Server defaults
    server_config_.api_port = 6666;
    server_config_.websocket_port = 6667;
    server_config_.host = "0.0.0.0";
    server_config_.max_connections = 100;
    server_config_.timeout_seconds = 30;
    
    // JACK defaults
    jack_config_.windows_host = "host.docker.internal";
    jack_config_.tools_path = "C:/PROGRA~1/JACK2/tools";
    jack_config_.timeout_ms = 10000;
    jack_config_.reconnect_interval_ms = 5000;
    jack_config_.monitor_interval_ms = 1000;
    jack_config_.auto_reconnect = true;
    
    // Logging defaults
    logging_config_.level = "info";
    logging_config_.file_enabled = true;
    logging_config_.file_path = "/app/logs/jack-bridge.log";
    logging_config_.console_enabled = true;
    logging_config_.max_file_size_mb = 10;
    logging_config_.max_files = 5;
    
    // Feature defaults
    feature_config_.auto_reconnect = true;
    feature_config_.connection_monitoring = true;
    feature_config_.state_persistence = true;
    feature_config_.websocket_updates = true;
    feature_config_.health_monitoring = true;
}

void ConfigManager::applyEnvironmentOverrides() {
    // Server configuration
    server_config_.api_port = getEnvVarInt("JACK_BRIDGE_API_PORT", server_config_.api_port);
    server_config_.websocket_port = getEnvVarInt("JACK_BRIDGE_WS_PORT", server_config_.websocket_port);
    server_config_.host = getEnvVar("JACK_BRIDGE_HOST", server_config_.host);
    
    // JACK configuration
    jack_config_.windows_host = getEnvVar("JACK_SERVER_HOST", jack_config_.windows_host);
    jack_config_.tools_path = getEnvVar("JACK_TOOLS_PATH", jack_config_.tools_path);
    jack_config_.timeout_ms = getEnvVarInt("JACK_TIMEOUT", jack_config_.timeout_ms);
    
    // Logging configuration
    logging_config_.level = getEnvVar("LOG_LEVEL", logging_config_.level);
    logging_config_.file_path = getEnvVar("LOG_FILE_PATH", logging_config_.file_path);
    logging_config_.file_enabled = getEnvVarBool("LOG_FILE_ENABLED", logging_config_.file_enabled);
    logging_config_.console_enabled = getEnvVarBool("LOG_CONSOLE_ENABLED", logging_config_.console_enabled);
}

std::string ConfigManager::getEnvVar(const std::string& name, const std::string& default_value) const {
    const char* value = std::getenv(name.c_str());
    return value ? std::string(value) : default_value;
}

int ConfigManager::getEnvVarInt(const std::string& name, int default_value) const {
    const char* value = std::getenv(name.c_str());
    if (value) {
        try {
            return std::stoi(value);
        } catch (...) {
            return default_value;
        }
    }
    return default_value;
}

bool ConfigManager::getEnvVarBool(const std::string& name, bool default_value) const {
    const char* value = std::getenv(name.c_str());
    if (value) {
        std::string str_value(value);
        return str_value == "true" || str_value == "1" || str_value == "yes";
    }
    return default_value;
}

bool ConfigManager::validate() const {
    // Basic validation
    if (server_config_.api_port < 1 || server_config_.api_port > 65535) return false;
    if (server_config_.websocket_port < 1 || server_config_.websocket_port > 65535) return false;
    if (jack_config_.timeout_ms <= 0) return false;
    return true;
}

ConfigManager ConfigManager::createDefault() {
    ConfigManager config;
    config.loadDefaults();
    config.loaded_ = true;
    return config;
}