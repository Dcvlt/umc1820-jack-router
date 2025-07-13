// jack-bridge/include/jack_controller.hpp
// Simplified version without external dependencies

#pragma once

#include <string>
#include <vector>
#include "types.hpp"

class JackController {
public:
    JackController() = default;
    ~JackController() = default;
    
    bool initialize();
    bool checkStatus();
    std::vector<JackConnection> getConnections();
    std::vector<JackPort> getPorts();
    
private:
    bool jack_running_ = false;
};

// Global functions (for now)
bool checkJackStatus();