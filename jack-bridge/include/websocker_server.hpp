// jack-bridge/include/websocket_server.hpp
// Simplified version

#pragma once

#include <string>
#include "types.hpp"

class WebSocketServer {
public:
    WebSocketServer() = default;
    ~WebSocketServer() = default;
    
    bool initialize();
    void start(int port);
    void stop();
    
private:
    bool running_ = false;
    int port_ = 6667;
};

// Global functions (for now)
void startWebSocketServer(int port);