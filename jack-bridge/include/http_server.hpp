// jack-bridge/include/http_server.hpp
// Simplified version without Boost

#pragma once

#include <string>
#include "types.hpp"

class HttpServer {
public:
    HttpServer() = default;
    ~HttpServer() = default;
    
    bool initialize();
    void start(int port);
    void stop();
    
private:
    bool running_ = false;
    int port_ = 6666;
};

// Global functions (for now)
void startHttpServer(int port);