// jack-bridge/include/config_manager.hpp
// Configuration management for JACK Bridge Service

#pragma once

#include <string>
#include <memory>
#include "types.hpp"

class ConfigManager {
private:
    ServerConfig server_config_;
    JackConfig jack_config_;
    LoggingConfig logging_config_;
    FeatureConfig feature_config_;
    std::string config_file_path_;
    bool loaded_;

public:
    ConfigManager();
    explicit ConfigManager(const std::string& config_file);
    ~ConfigManager() = default;

    // Configuration loading
    bool load();
    bool load(const std::string& config_file);
    bool reload();
    bool save();
    bool save(const std::string& config_file);

    // Server configuration
    int getApiPort() const { return server_config_.api_port; }
    int getWebSocketPort() const { return server_config_.websocket_port; }
    std::string getHost() const { return server_config_.host; }
    int getMaxConnections() const { return server_config_.max_connections; }
    int getTimeoutSeconds() const { return server_config_.timeout_seconds; }

    void setApiPort(int port) { server_config_.api_port = port; }
    void setWebSocketPort(int port) { server_config_.websocket_port = port; }
    void setHost(const std::string& host) { server_config_.host = host; }

    // JACK configuration
    std::string getWindowsHost() const { return jack_config_.windows_host; }
    std::string getJackToolsPath() const { return jack_config_.tools_path; }
    int getJackTimeout() const { return jack_config_.timeout_ms; }
    int getReconnectInterval() const { return jack_config_.reconnect_interval_ms; }
    int getMonitorInterval() const { return jack_config_.monitor_interval_ms; }
    bool getAutoReconnect() const { return jack_config_.auto_reconnect; }

    void setWindowsHost(const std::string& host) { jack_config_.windows_host = host; }
    void setJackToolsPath(const std::string& path) { jack_config_.tools_path = path; }
    void setJackTimeout(int timeout) { jack_config_.timeout_ms = timeout; }

    // Logging configuration
    std::string getLogLevel() const { return logging_config_.level; }
    bool isFileLoggingEnabled() const { return logging_config_.file_enabled; }
    std::string getLogFilePath() const { return logging_config_.file_path; }
    bool isConsoleLoggingEnabled() const { return logging_config_.console_enabled; }
    int getMaxFileSizeMB() const { return logging_config_.max_file_size_mb; }
    int getMaxFiles() const { return logging_config_.max_files; }

    void setLogLevel(const std::string& level) { logging_config_.level = level; }
    void setFileLogging(bool enabled) { logging_config_.file_enabled = enabled; }
    void setLogFilePath(const std::string& path) { logging_config_.file_path = path; }

    // Feature configuration
    bool isAutoReconnectEnabled() const { return feature_config_.auto_reconnect; }
    bool isConnectionMonitoringEnabled() const { return feature_config_.connection_monitoring; }
    bool isStatePersistenceEnabled() const { return feature_config_.state_persistence; }
    bool isWebSocketUpdatesEnabled() const { return feature_config_.websocket_updates; }
    bool isHealthMonitoringEnabled() const { return feature_config_.health_monitoring; }

    void setAutoReconnect(bool enabled) { feature_config_.auto_reconnect = enabled; }
    void setConnectionMonitoring(bool enabled) { feature_config_.connection_monitoring = enabled; }

    // Utility methods
    bool isLoaded() const { return loaded_; }
    std::string getConfigFilePath() const { return config_file_path_; }
    void setConfigFilePath(const std::string& path) { config_file_path_ = path; }

    // Get full configuration structures
    const ServerConfig& getServerConfig() const { return server_config_; }
    const JackConfig& getJackConfig() const { return jack_config_; }
    const LoggingConfig& getLoggingConfig() const { return logging_config_; }
    const FeatureConfig& getFeatureConfig() const { return feature_config_; }

    // Environment variable overrides
    void applyEnvironmentOverrides();
    
    // Validation
    bool validate() const;
    std::vector<std::string> getValidationErrors() const;

    // Default configuration
    void loadDefaults();
    static ConfigManager createDefault();

private:
    // JSON parsing helpers
    bool parseJsonConfig(const std::string& json_content);
    std::string generateJsonConfig() const;
    bool createDefaultConfigFile();
    
    // Environment variable helpers
    std::string getEnvVar(const std::string& name, const std::string& default_value = "") const;
    int getEnvVarInt(const std::string& name, int default_value) const;
    bool getEnvVarBool(const std::string& name, bool default_value) const;
};