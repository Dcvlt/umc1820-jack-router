// jack-bridge/include/windows_jack_client.hpp
// Windows JACK Client for cross-platform communication

#pragma once

#include <string>
#include <vector>
#include <memory>
#include <future>
#include <chrono>
#include <functional>
#include "types.hpp"

class WindowsJackClient {
public:
    enum class CommandMethod {
        WINDOWS_EXECUTABLE,  // Direct Windows .exe execution
        WSL_BRIDGE,         // Through WSL bridge
        TCP_SOCKET,         // TCP communication
        NAMED_PIPE          // Named pipe communication
    };
    
    struct ExecutionResult {
        bool success;
        std::string output;
        std::string error;
        int exit_code;
        std::chrono::milliseconds execution_time;
    };

private:
    std::string windows_host_;
    std::string jack_tools_path_;
    CommandMethod preferred_method_;
    std::chrono::milliseconds timeout_;
    
    // Command execution methods
    ExecutionResult executeWindowsCommand(const std::string& command);
    ExecutionResult executeWSLCommand(const std::string& command);
    ExecutionResult executeTCPCommand(const std::string& command);
    ExecutionResult executeNamedPipeCommand(const std::string& command);
    
    // Helper methods
    std::string buildJackCommand(const std::string& tool, const std::vector<std::string>& args);
    bool detectBestMethod();
    std::string escapeArgument(const std::string& arg);
    
public:
    explicit WindowsJackClient(const std::string& windows_host = "host.docker.internal",
                              const std::string& jack_tools_path = "C:/PROGRA~1/JACK2/tools");
    
    ~WindowsJackClient() = default;
    
    // Configuration
    void setWindowsHost(const std::string& host) { windows_host_ = host; }
    void setJackToolsPath(const std::string& path) { jack_tools_path_ = path; }
    void setPreferredMethod(CommandMethod method) { preferred_method_ = method; }
    void setTimeout(std::chrono::milliseconds timeout) { timeout_ = timeout; }
    
    // Connection and status
    bool initialize();
    bool isJackRunning();
    std::string getJackVersion();
    
    // Port operations
    std::vector<JackPort> listPorts();
    bool portExists(const std::string& port_name);
    JackPort getPortInfo(const std::string& port_name);
    
    // Connection operations
    std::vector<JackConnection> listConnections();
    bool connect(const std::string& from_port, const std::string& to_port);
    bool disconnect(const std::string& from_port, const std::string& to_port);
    bool isConnected(const std::string& from_port, const std::string& to_port);
    bool disconnectAll();
    bool disconnectPort(const std::string& port_name);
    
    // Async operations
    std::future<ExecutionResult> connectAsync(const std::string& from_port, const std::string& to_port);
    std::future<ExecutionResult> disconnectAsync(const std::string& from_port, const std::string& to_port);
    std::future<std::vector<JackConnection>> listConnectionsAsync();
    
    // Utility
    CommandMethod getCurrentMethod() const { return preferred_method_; }
    std::string getLastError() const;
    bool testConnection();
    
    // Batch operations
    struct BatchOperation {
        enum Type { CONNECT, DISCONNECT };
        Type type;
        std::string from_port;
        std::string to_port;
    };
    
    struct BatchResult {
        size_t total_operations;
        size_t successful_operations;
        size_t failed_operations;
        std::vector<std::string> errors;
        std::chrono::milliseconds total_time;
    };
    
    BatchResult executeBatch(const std::vector<BatchOperation>& operations);
};

// Windows-specific JACK command builder
class JackCommandBuilder {
private:
    std::string base_path_;
    std::vector<std::string> arguments_;
    
public:
    explicit JackCommandBuilder(const std::string& jack_tools_path);
    
    // Command building
    JackCommandBuilder& tool(const std::string& tool_name);
    JackCommandBuilder& arg(const std::string& argument);
    JackCommandBuilder& ports(const std::string& from, const std::string& to);
    JackCommandBuilder& listConnections();
    JackCommandBuilder& listPorts();
    JackCommandBuilder& timeout(int seconds);
    
    // Build final command
    std::string build() const;
    std::string buildPowerShell() const;
    std::string buildWSL() const;
    
    // Reset for reuse
    void reset();
};

// JACK process monitor for Windows host
class JackProcessMonitor {
public:
    struct ProcessInfo {
        uint32_t pid;
        std::string name;
        std::string command_line;
        bool is_running;
        std::chrono::system_clock::time_point start_time;
    };
    
private:
    std::string windows_host_;
    std::chrono::milliseconds check_interval_;
    std::function<void(bool)> status_callback_;
    
public:
    explicit JackProcessMonitor(const std::string& windows_host = "host.docker.internal");
    
    // Monitoring
    std::vector<ProcessInfo> getJackProcesses();
    bool isQJackCtlRunning();
    bool isJackdRunning();
    bool startJackServer();
    bool stopJackServer();
    
    // Callbacks
    void setStatusCallback(std::function<void(bool)> callback) { status_callback_ = callback; }
    
    // Process management
    bool killJackProcesses();
    bool restartJackServer();
    ProcessInfo getMainJackProcess();
};