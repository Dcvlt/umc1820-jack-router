SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"  # Assumes script is in system_services subdirectory
NODE_SERVICE="server.js"
PID_FILE="$PROJECT_DIR/jack_audio.pid"
LOG_FILE="$PROJECT_DIR/jack_audio.log"
STATE_FILE="$PROJECT_DIR/last_state.json"

# Development mode flag
DEV_MODE=true

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log messages
log_message() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

# Function to check if service is running
is_running() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        if ps -p $pid > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

# Function to check if JACK server is running on Windows host
check_jack_server() {
    log_message "Checking if JACK server is running on Windows host..."
    
    # Check if qjackctl.exe is running on Windows
    if powershell.exe -NoProfile -Command "Get-Process -Name qjackctl -ErrorAction SilentlyContinue" >/dev/null 2>&1; then
        log_message "${GREEN}JACK Control (qjackctl) is running on Windows"
        return 0
    fi
    
    # Check if jackd is running
    if powershell.exe -NoProfile -Command "Get-Process -Name jackd -ErrorAction SilentlyContinue" >/dev/null 2>&1; then
        log_message "${GREEN}JACK daemon is running on Windows"
        return 0
    fi
    
    log_message "${RED}JACK server processes not found on Windows"
    log_message "${YELLOW}Please make sure JACK server is running on Windows host"
    log_message "  - Check if qjackctl.exe is running in Task Manager"
    log_message "  - Or run jack_audio_startup.bat to start it"
    return 1
}

# Function to check if npm is available and package.json exists
check_npm_setup() {
    if [ ! -f "$PROJECT_DIR/package.json" ]; then
        log_message "${RED}Error: package.json not found in $PROJECT_DIR"
        return 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_message "${RED}Error: npm command not found"
        return 1
    fi
    
    # Check if dev script exists in package.json
    if ! grep -q '"dev"' "$PROJECT_DIR/package.json"; then
        log_message "${YELLOW}Warning: 'dev' script not found in package.json"
        log_message "Make sure you have a 'dev' script defined like:"
        log_message '  "scripts": { "dev": "nodemon server.js" }'
        return 1
    fi
    
    return 0
}

# Function to start the service (modified for dev mode)
start_service() {
    if is_running; then
        log_message "${YELLOW}Service is already running (PID: $(cat $PID_FILE))"
        return 0
    fi

    # Check if JACK server is running first
    if ! check_jack_server; then
        log_message "${RED}Cannot start service: JACK server is not running"
        return 1
    fi

    log_message "Starting JACK Audio Router Service..."
    
    # Change to project directory
    cd "$PROJECT_DIR" || {
        log_message "${RED}Error: Cannot change to project directory: $PROJECT_DIR"
        exit 1
    }

    # Start the service based on mode
    if [ "$DEV_MODE" = true ]; then
        log_message "Starting in development mode with npm run dev..."
        
        # Check npm setup
        if ! check_npm_setup; then
            log_message "${RED}Cannot start in dev mode, falling back to node server.js"
            nohup node "$NODE_SERVICE" >> "$LOG_FILE" 2>&1 &
            service_pid=$!
        else
            # Start with npm run dev
            nohup npm run dev >> "$LOG_FILE" 2>&1 &
            service_pid=$!
        fi
    else
        log_message "Starting in production mode..."
        # Start the Node.js service directly
        nohup node "$NODE_SERVICE" >> "$LOG_FILE" 2>&1 &
        service_pid=$!
    fi
    
    # Save PID
    echo $service_pid > "$PID_FILE"
    
    # Wait a moment and check if it's still running
    sleep 3
    if is_running; then
        log_message "${GREEN}Service started successfully (PID: $service_pid)"
        return 0
    else
        log_message "${RED}Failed to start service"
        log_message "Check the log file for details: $LOG_FILE"
        return 1
    fi
}

# Function to stop the service
stop_service() {
    if ! is_running; then
        log_message "${YELLOW}Service is not running"
        return 0
    fi

    pid=$(cat "$PID_FILE")
    log_message "Stopping JACK Audio Router Service (PID: $pid)..."
    
    # Save current state before stopping
    save_current_state
    
    # Send SIGTERM first
    kill -TERM $pid 2>/dev/null
    
    # Wait for graceful shutdown
    sleep 3
    
    # If still running, force kill
    if ps -p $pid > /dev/null 2>&1; then
        log_message "Forcing shutdown..."
        kill -KILL $pid 2>/dev/null
    fi
    
    # Clean up PID file
    rm -f "$PID_FILE"
    log_message "${GREEN}Service stopped successfully"
}

# Function to save current JACK state
save_current_state() {
    log_message "Saving current audio routing state..."
    
    # Get current connections via API
    current_state=$(curl -s "http://localhost:3001/api/status" 2>/dev/null)
    
    if [ $? -eq 0 ] && [ -n "$current_state" ]; then
        echo "$current_state" > "$STATE_FILE"
        log_message "State saved to $STATE_FILE"
    else
        log_message "${YELLOW}Could not save current state (service might not be running)"
    fi
}

# Function to restore previous state
restore_previous_state() {
    if [ ! -f "$STATE_FILE" ]; then
        log_message "${YELLOW}No previous state file found"
        return 1
    fi

    log_message "Restoring previous audio routing state..."
    
    # Wait for service to be ready
    local max_attempts=60
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "http://localhost:3001/health" > /dev/null 2>&1; then
            break
        fi
        sleep 1
        ((attempt++))
    done
    
    if [ $attempt -eq $max_attempts ]; then
        log_message "${RED}Service not ready after 60 seconds, cannot restore state"
        return 1
    fi
    
    log_message "Service is ready, state restoration complete"
    return 0
}

# Function to restart the service
restart_service() {
    log_message "Restarting JACK Audio Router Service..."
    stop_service
    sleep 2
    start_service
    if [ $? -eq 0 ]; then
        restore_previous_state
    fi
}

# Function to show service status
show_status() {
    echo -e "${YELLOW}=== JACK Audio Router Service Status ===${NC}"
    echo -e "Project Directory: $PROJECT_DIR"
    echo -e "Development Mode: $DEV_MODE"
    echo ""
    
    if is_running; then
        pid=$(cat "$PID_FILE")
        echo -e "${GREEN}✓ JACK Audio Router Service is running (PID: $pid)${NC}"
        
        # Show API status
        api_status=$(curl -s "http://localhost:3001/health" 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ API is responding${NC}"
        else
            echo -e "${RED}✗ API is not responding${NC}"
        fi
        
        # Show log tail
        echo -e "\n${YELLOW}Recent log entries:${NC}"
        tail -n 5 "$LOG_FILE" 2>/dev/null || echo "No log entries"
    else
        echo -e "${RED}✗ JACK Audio Router Service is not running${NC}"
    fi
    
    # Check JACK server status
    echo -e "\n${YELLOW}JACK Server Status:${NC}"
    check_jack_server
}

# Function to show logs
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        echo -e "${YELLOW}=== JACK Audio Router Service Logs ===${NC}"
        tail -n 50 "$LOG_FILE"
    else
        echo -e "${RED}No log file found${NC}"
    fi
}

# Function to toggle development mode
toggle_dev_mode() {
    if [ "$DEV_MODE" = true ]; then
        sed -i 's/DEV_MODE=true/DEV_MODE=false/' "$0"
        log_message "Development mode disabled"
    else
        sed -i 's/DEV_MODE=false/DEV_MODE=true/' "$0"
        log_message "Development mode enabled"
    fi
}

# Function to install dependencies
install_deps() {
    log_message "Installing npm dependencies..."
    cd "$PROJECT_DIR" || {
        log_message "${RED}Error: Cannot change to project directory"
        exit 1
    }
    
    npm install
    if [ $? -eq 0 ]; then
        log_message "${GREEN}Dependencies installed successfully"
    else
        log_message "${RED}Failed to install dependencies"
    fi
}

# Function to install as system service
install_systemd_service() {
    log_message "Installing systemd service..."
    
    # Create systemd service file
    cat > /tmp/jack-audio-router.service << EOF
[Unit]
Description=JACK Audio Router Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/node $PROJECT_DIR/$NODE_SERVICE
Restart=always
RestartSec=10
StandardOutput=append:$LOG_FILE
StandardError=append:$LOG_FILE

[Install]
WantedBy=multi-user.target
EOF

    # Install the service
    sudo mv /tmp/jack-audio-router.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable jack-audio-router
    
    log_message "${GREEN}Systemd service installed successfully"
    log_message "Use 'sudo systemctl start jack-audio-router' to start"
    log_message "Use 'sudo systemctl status jack-audio-router' to check status"
}

# Main script logic
case "$1" in
    start)
        start_service
        if [ $? -eq 0 ]; then
            restore_previous_state
        fi
        ;;
    stop)
        stop_service
        ;;
    restart)
        restart_service
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    install-service)
        install_systemd_service
        ;;
    save-state)
        save_current_state
        ;;
    restore-state)
        restore_previous_state
        ;;
    toggle-dev)
        toggle_dev_mode
        ;;
    install-deps)
        install_deps
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|install-service|save-state|restore-state|toggle-dev|install-deps}"
        echo ""
        echo "Commands:"
        echo "  start           - Start the JACK Audio Router service"
        echo "  stop            - Stop the service (saves current state)"
        echo "  restart         - Restart the service (restores previous state)"
        echo "  status          - Show service status"
        echo "  logs            - Show recent log entries"
        echo "  install-service - Install as systemd service"
        echo "  save-state      - Manually save current audio routing state"
        echo "  restore-state   - Manually restore previous audio routing state"
        echo "  toggle-dev      - Toggle between development and production mode"
        echo "  install-deps    - Install npm dependencies"
        echo ""
        echo "Current mode: $([ "$DEV_MODE" = true ] && echo "Development (npm run dev)" || echo "Production (node server.js)")"
        exit 1
        ;;
esac