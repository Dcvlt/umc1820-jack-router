#!/bin/bash

# JACK Audio Router Service Startup Script
# This script starts the JACK Audio Router service for UMC1820

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"  # Assumes script is in system_services subdirectory
NODE_SERVICE="server.js"
PID_FILE="$PROJECT_DIR/jack_audio.pid"
LOG_FILE="$PROJECT_DIR/jack_audio.log"
STATE_FILE="$PROJECT_DIR/last_state.json"

# Development mode flag
DEV_MODE=true

# Verbose mode flag (can be set via environment variable)
VERBOSE=${JACK_VERBOSE:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to log messages
log_message() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

# Function to log verbose messages
log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${CYAN}[VERBOSE]${NC} $1" | tee -a "$LOG_FILE"
    fi
}

# Function to show progress bar
show_progress() {
    local current=$1
    local total=$2
    local message="$3"
    local width=50
    local percentage=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    
    printf "\r${BLUE}[${NC}"
    printf "%*s" $filled | tr ' ' '='
    printf "%*s" $empty | tr ' ' '-'
    printf "${BLUE}]${NC} %d%% %s" $percentage "$message"
    
    if [ $current -eq $total ]; then
        echo ""
    fi
}

# Function to animate dots during waiting
animate_dots() {
    local message="$1"
    local max_time=$2
    local elapsed=0
    
    while [ $elapsed -lt $max_time ]; do
        for dots in "." ".." "..."; do
            printf "\r${YELLOW}%s%s${NC}" "$message" "$dots"
            sleep 0.5
            elapsed=$((elapsed + 1))
            if [ $elapsed -ge $max_time ]; then
                break
            fi
        done
    done
    echo ""
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
    log_message "🔍 Checking if JACK server is running on Windows host..."
    log_verbose "Attempting to detect qjackctl.exe process..."
    
    # Check if qjackctl.exe is running on Windows
    if powershell.exe -NoProfile -Command "Get-Process -Name qjackctl -ErrorAction SilentlyContinue" >/dev/null 2>&1; then
        log_message "${GREEN}✅ JACK Control (qjackctl) is running on Windows${NC}"
        log_verbose "qjackctl.exe process found and active"
        return 0
    fi
    
    log_verbose "qjackctl.exe not found, checking for jackd..."
    
    # Check if jackd is running
    if powershell.exe -NoProfile -Command "Get-Process -Name jackd -ErrorAction SilentlyContinue" >/dev/null 2>&1; then
        log_message "${GREEN}✅ JACK daemon is running on Windows${NC}"
        log_verbose "jackd process found and active"
        return 0
    fi
    
    log_message "${RED}❌ JACK server processes not found on Windows${NC}"
    log_message "${YELLOW}⚠️ Please make sure JACK server is running on Windows host${NC}"
    log_message "  📋 Check if qjackctl.exe is running in Task Manager"
    log_message "  🚀 Or run jack_audio_startup.bat to start it"
    return 1
}

# Function to check if npm is available and package.json exists
check_npm_setup() {
    log_verbose "Checking npm setup and package.json..."
    
    if [ ! -f "$PROJECT_DIR/package.json" ]; then
        log_message "${RED}❌ Error: package.json not found in $PROJECT_DIR${NC}"
        return 1
    fi
    log_verbose "✓ package.json found"
    
    if ! command -v npm &> /dev/null; then
        log_message "${RED}❌ Error: npm command not found${NC}"
        return 1
    fi
    log_verbose "✓ npm command available"
    
    # Check if dev script exists in package.json
    if ! grep -q '"dev"' "$PROJECT_DIR/package.json"; then
        log_message "${YELLOW}⚠️ Warning: 'dev' script not found in package.json${NC}"
        log_message "Make sure you have a 'dev' script defined like:"
        log_message '  "scripts": { "dev": "nodemon server.js" }'
        return 1
    fi
    log_verbose "✓ dev script found in package.json"
    
    return 0
}

# Function to start the service with progress tracking
start_service() {
    if is_running; then
        log_message "${YELLOW}⚠️ Service is already running (PID: $(cat $PID_FILE))${NC}"
        return 0
    fi

    echo -e "${BLUE}🎵 Starting JACK Audio Router Service...${NC}"
    echo ""

    # Step 1: Check JACK server
    show_progress 1 5 "Checking JACK server status..."
    if ! check_jack_server; then
        log_message "${RED}❌ Cannot start service: JACK server is not running${NC}"
        return 1
    fi

    # Step 2: Validate environment
    show_progress 2 5 "Validating environment..."
    log_verbose "Changing to project directory: $PROJECT_DIR"
    cd "$PROJECT_DIR" || {
        log_message "${RED}❌ Error: Cannot change to project directory: $PROJECT_DIR${NC}"
        exit 1
    }

    # Step 3: Check dependencies
    show_progress 3 5 "Checking dependencies..."
    if [ "$DEV_MODE" = true ]; then
        log_verbose "Development mode enabled, checking npm setup..."
        if ! check_npm_setup; then
            log_message "${YELLOW}⚠️ Cannot start in dev mode, falling back to node server.js${NC}"
            DEV_MODE=false
        fi
    fi

    # Step 4: Start the service
    show_progress 4 5 "Starting service..."
    log_message "🚀 Starting JACK Audio Router Service..."
    
    if [ "$DEV_MODE" = true ]; then
        log_message "🔧 Starting in development mode with npm run dev..."
        log_verbose "Command: npm run dev"
        # Start with npm run dev and capture output
        nohup npm run dev >> "$LOG_FILE" 2>&1 &
        service_pid=$!
        log_verbose "Started npm process with PID: $service_pid"
    else
        log_message "🏭 Starting in production mode..."
        log_verbose "Command: node $NODE_SERVICE"
        # Start the Node.js service directly
        nohup node "$NODE_SERVICE" >> "$LOG_FILE" 2>&1 &
        service_pid=$!
        log_verbose "Started node process with PID: $service_pid"
    fi
    
    # Save PID
    echo $service_pid > "$PID_FILE"
    log_verbose "PID saved to: $PID_FILE"

    # Step 5: Verify startup
    show_progress 5 5 "Verifying startup..."
    
    # Wait and check if it's still running with progress
    echo -e "\n${YELLOW}⏳ Waiting for service to initialize${NC}"
    for i in {1..6}; do
        sleep 0.5
        show_progress $i 6 "Checking service health..."
    done
    
    if is_running; then
        echo -e "\n${GREEN}✅ Service started successfully (PID: $service_pid)${NC}"
        log_message "${GREEN}✅ Service started successfully (PID: $service_pid)${NC}"
        
        # Show service info
        echo -e "${CYAN}📊 Service Information:${NC}"
        echo -e "   🆔 PID: $service_pid"
        echo -e "   📁 Directory: $PROJECT_DIR"
        echo -e "   🔧 Mode: $([ "$DEV_MODE" = true ] && echo "Development" || echo "Production")"
        echo -e "   📄 Log file: $LOG_FILE"
        
        return 0
    else
        echo -e "\n${RED}❌ Failed to start service${NC}"
        log_message "${RED}❌ Failed to start service${NC}"
        log_message "📋 Check the log file for details: $LOG_FILE"
        
        # Show recent log entries
        if [ -f "$LOG_FILE" ]; then
            echo -e "\n${YELLOW}📋 Recent log entries:${NC}"
            tail -n 10 "$LOG_FILE"
        fi
        
        return 1
    fi
}

# Enhanced function to restore previous state with progress tracking
restore_previous_state() {
    if [ ! -f "$STATE_FILE" ]; then
        log_message "${YELLOW}⚠️ No previous state file found${NC}"
        return 1
    fi

    log_message "🔄 Restoring previous audio routing state..."
    log_verbose "State file: $STATE_FILE"
    
    # Wait for service to be ready with progress tracking
    local max_attempts=60
    local attempt=0
    
    echo -e "${YELLOW}⏳ Waiting for service to be ready${NC}"
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "http://localhost:3001/health" > /dev/null 2>&1; then
            echo -e "\n${GREEN}✅ Service is ready${NC}"
            log_message "✅ Service is ready, state restoration complete"
            log_verbose "Health check passed at attempt $((attempt + 1))"
            return 0
        fi
        
        # Show progress every 5 attempts
        if [ $((attempt % 5)) -eq 0 ]; then
            show_progress $attempt $max_attempts "Waiting for API to respond..."
            log_verbose "Health check attempt $((attempt + 1))/$max_attempts"
        fi
        
        sleep 1
        ((attempt++))
    done
    
    echo -e "\n${RED}❌ Service not ready after 60 seconds, cannot restore state${NC}"
    log_message "${RED}❌ Service not ready after 60 seconds, cannot restore state${NC}"
    log_verbose "Health check failed after $max_attempts attempts"
    
    # Check if service is still running
    if is_running; then
        log_message "${YELLOW}⚠️ Service is running but API is not responding${NC}"
        echo -e "${YELLOW}📋 Recent log entries:${NC}"
        tail -n 15 "$LOG_FILE"
    else
        log_message "${RED}❌ Service has stopped unexpectedly${NC}"
    fi
    
    return 1
}

# Function to stop the service
stop_service() {
    if ! is_running; then
        log_message "${YELLOW}⚠️ Service is not running${NC}"
        return 0
    fi

    pid=$(cat "$PID_FILE")
    log_message "🛑 Stopping JACK Audio Router Service (PID: $pid)..."
    log_verbose "Attempting graceful shutdown with SIGTERM"
    
    # Save current state before stopping
    save_current_state
    
    # Send SIGTERM first
    kill -TERM $pid 2>/dev/null
    
    # Wait for graceful shutdown with progress
    echo -e "${YELLOW}⏳ Waiting for graceful shutdown${NC}"
    for i in {1..6}; do
        if ! ps -p $pid > /dev/null 2>&1; then
            break
        fi
        show_progress $i 6 "Shutting down gracefully..."
        sleep 0.5
    done
    
    # If still running, force kill
    if ps -p $pid > /dev/null 2>&1; then
        log_message "🔨 Forcing shutdown..."
        log_verbose "Sending SIGKILL to process $pid"
        kill -KILL $pid 2>/dev/null
        sleep 1
    fi
    
    # Clean up PID file
    rm -f "$PID_FILE"
    log_message "${GREEN}✅ Service stopped successfully${NC}"
}

# Function to save current JACK state
save_current_state() {
    log_message "💾 Saving current audio routing state..."
    log_verbose "Attempting to fetch state from API..."
    
    # Get current connections via API
    current_state=$(curl -s "http://localhost:3001/api/status" 2>/dev/null)
    
    if [ $? -eq 0 ] && [ -n "$current_state" ]; then
        echo "$current_state" > "$STATE_FILE"
        log_message "✅ State saved to $STATE_FILE"
        log_verbose "State data: ${#current_state} characters"
    else
        log_message "${YELLOW}⚠️ Could not save current state (service might not be running)${NC}"
        log_verbose "API request failed or returned empty response"
    fi
}

# Function to restart the service
restart_service() {
    log_message "🔄 Restarting JACK Audio Router Service..."
    echo -e "${BLUE}🔄 Restarting JACK Audio Router Service...${NC}\n"
    
    stop_service
    echo -e "\n${YELLOW}⏳ Waiting before restart...${NC}"
    sleep 2
    
    start_service
    if [ $? -eq 0 ]; then
        echo ""
        restore_previous_state
    fi
}

# Enhanced function to show service status
show_status() {
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    echo -e "${YELLOW}🎵 JACK Audio Router Service Status${NC}"
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    echo -e "📁 Project Directory: ${CYAN}$PROJECT_DIR${NC}"
    echo -e "🔧 Development Mode: ${CYAN}$DEV_MODE${NC}"
    echo -e "📝 Verbose Mode: ${CYAN}$VERBOSE${NC}"
    echo ""
    
    if is_running; then
        pid=$(cat "$PID_FILE")
        echo -e "${GREEN}✅ JACK Audio Router Service is running (PID: $pid)${NC}"
        
        # Show API status with timeout
        echo -e "\n${YELLOW}🔍 Checking API status...${NC}"
        api_status=$(timeout 5 curl -s "http://localhost:3001/health" 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ API is responding${NC}"
            log_verbose "API health check successful"
        else
            echo -e "${RED}❌ API is not responding${NC}"
            log_verbose "API health check failed or timed out"
        fi
        
        # Show memory usage
        if command -v ps &> /dev/null; then
            memory_usage=$(ps -p $pid -o rss= 2>/dev/null | xargs)
            if [ -n "$memory_usage" ]; then
                memory_mb=$((memory_usage / 1024))
                echo -e "💾 Memory Usage: ${CYAN}${memory_mb} MB${NC}"
            fi
        fi
        
        # Show log tail
        echo -e "\n${YELLOW}📋 Recent log entries:${NC}"
        echo -e "${BLUE}─────────────────────────────────────${NC}"
        tail -n 5 "$LOG_FILE" 2>/dev/null || echo "No log entries"
        echo -e "${BLUE}─────────────────────────────────────${NC}"
    else
        echo -e "${RED}❌ JACK Audio Router Service is not running${NC}"
    fi
    
    # Check JACK server status
    echo -e "\n${YELLOW}🎛️ JACK Server Status:${NC}"
    echo -e "${BLUE}─────────────────────────────────────${NC}"
    check_jack_server
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
}

# Function to show logs
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        echo -e "${BLUE}═══════════════════════════════════════${NC}"
        echo -e "${YELLOW}📋 JACK Audio Router Service Logs${NC}"
        echo -e "${BLUE}═══════════════════════════════════════${NC}"
        tail -n 50 "$LOG_FILE"
        echo -e "${BLUE}═══════════════════════════════════════${NC}"
    else
        echo -e "${RED}❌ No log file found${NC}"
    fi
}

# Function to toggle development mode
toggle_dev_mode() {
    if [ "$DEV_MODE" = true ]; then
        sed -i 's/DEV_MODE=true/DEV_MODE=false/' "$0"
        log_message "🔧 Development mode disabled"
    else
        sed -i 's/DEV_MODE=false/DEV_MODE=true/' "$0"
        log_message "🔧 Development mode enabled"
    fi
}

# Function to install dependencies
install_deps() {
    log_message "📦 Installing npm dependencies..."
    echo -e "${BLUE}📦 Installing npm dependencies...${NC}\n"
    
    cd "$PROJECT_DIR" || {
        log_message "${RED}❌ Error: Cannot change to project directory${NC}"
        exit 1
    }
    
    echo -e "${YELLOW}⏳ Running npm install...${NC}"
    if [ "$VERBOSE" = true ]; then
        npm install
    else
        npm install --silent
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Dependencies installed successfully${NC}"
        log_message "${GREEN}✅ Dependencies installed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        log_message "${RED}❌ Failed to install dependencies${NC}"
    fi
}

# Function to install as system service
install_systemd_service() {
    log_message "🔧 Installing systemd service..."
    
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
    
    log_message "${GREEN}✅ Systemd service installed successfully${NC}"
    log_message "Use 'sudo systemctl start jack-audio-router' to start"
    log_message "Use 'sudo systemctl status jack-audio-router' to check status"
}

# Main script logic
case "$1" in
    start)
        start_service
        if [ $? -eq 0 ]; then
            echo ""
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
    -v|--verbose)
        VERBOSE=true
        shift
        "$0" "$@"
        ;;
    *)
        echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
        echo -e "${YELLOW}🎵 JACK Audio Router Service Control Script${NC}"
        echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
        echo "Usage: $0 [OPTIONS] {COMMAND}"
        echo ""
        echo -e "${YELLOW}OPTIONS:${NC}"
        echo "  -v, --verbose       Enable verbose logging"
        echo ""
        echo -e "${YELLOW}COMMANDS:${NC}"
        echo "  start               Start the JACK Audio Router service"
        echo "  stop                Stop the service (saves current state)"
        echo "  restart             Restart the service (restores previous state)"
        echo "  status              Show detailed service status"
        echo "  logs                Show recent log entries"
        echo "  install-service     Install as systemd service"
        echo "  save-state          Manually save current audio routing state"
        echo "  restore-state       Manually restore previous audio routing state"
        echo "  toggle-dev          Toggle between development and production mode"
        echo "  install-deps        Install npm dependencies"
        echo ""
        echo -e "${CYAN}EXAMPLES:${NC}"
        echo "  $0 start            # Start service normally"
        echo "  $0 -v start         # Start service with verbose output"
        echo "  $0 status           # Show service status"
        echo "  JACK_VERBOSE=true $0 start  # Start with verbose via environment"
        echo ""
        echo -e "${YELLOW}Current mode:${NC} $([ "$DEV_MODE" = true ] && echo "Development (npm run dev)" || echo "Production (node server.js)")"
        echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
        exit 1
        ;;
esac