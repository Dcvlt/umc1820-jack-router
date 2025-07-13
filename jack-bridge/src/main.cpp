// jack-bridge/src/main.cpp
// Minimal JACK Bridge Service without external dependencies

#include <iostream>
#include <thread>
#include <chrono>
#include <csignal>
#include <atomic>
#include "config_manager.hpp"

std::atomic<bool> running{true};

void signalHandler(int signal) {
    std::cout << "Received signal " << signal << ", shutting down..." << std::endl;
    running = false;
}

int main() {
    std::cout << "🎵 JACK Bridge Service starting..." << std::endl;
    
    // Setup signal handlers
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);
    
    // Load configuration
    ConfigManager config;
    if (!config.load()) {
        std::cerr << "Failed to load configuration" << std::endl;
        return 1;
    }
    
    std::cout << "✅ Configuration loaded" << std::endl;
    std::cout << "📡 API Port: " << config.getApiPort() << std::endl;
    std::cout << "🔄 WebSocket Port: " << config.getWebSocketPort() << std::endl;
    
    // Main service loop (simplified)
    while (running) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
        
        // Basic health check output
        static int counter = 0;
        if (++counter % 30 == 0) {
            std::cout << "🔄 Service running... (" << counter << "s)" << std::endl;
        }
    }
    
    std::cout << "🛑 JACK Bridge Service stopped" << std::endl;
    return 0;
}