# fix-mosquitto.ps1
# Fix Mosquitto configuration issues

Write-Host "🦟 Fixing Mosquitto Configuration" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Stop all services
Write-Host "Stopping Docker services..." -ForegroundColor Yellow
docker-compose down -v 2>$null

# Remove any existing mosquitto containers and volumes
Write-Host "Removing old Mosquitto containers and volumes..." -ForegroundColor Yellow
docker container rm jack-audio-mosquitto -f 2>$null
docker volume rm jack-mosquitto-data -f 2>$null
docker volume rm jack-mosquitto-logs -f 2>$null

# Ensure config directory exists
if (-not (Test-Path "config")) {
    New-Item -ItemType Directory -Name "config" -Force | Out-Null
    Write-Host "Created config directory" -ForegroundColor Green
}

# Create a completely clean Mosquitto config
Write-Host "Creating clean Mosquitto configuration..." -ForegroundColor Yellow

$mosquittoConfig = @"
# Mosquitto MQTT Broker Configuration
# Clean configuration without deprecated options

# =============================================================================
# LISTENERS
# =============================================================================

# MQTT listener on port 1883
listener 1883
allow_anonymous true

# WebSocket listener on port 7777  
listener 7777
protocol websockets
allow_anonymous true

# =============================================================================
# PERSISTENCE
# =============================================================================

persistence true
persistence_location /mosquitto/data/
persistence_file mosquitto.db
autosave_interval 1800

# =============================================================================
# LOGGING
# =============================================================================

log_dest file /mosquitto/log/mosquitto.log
log_dest stdout

# Log types
log_type error
log_type warning  
log_type notice
log_type information

# Connection logging
connection_messages true
log_timestamp true

# =============================================================================
# PROTOCOL SETTINGS
# =============================================================================

keepalive_interval 60
max_connections -1
max_queued_messages 1000
max_inflight_messages 20

# =============================================================================
# MESSAGE HANDLING
# =============================================================================

retain_available true
max_packet_size 65535
message_size_limit 0

# =============================================================================
# PERFORMANCE
# =============================================================================

sys_interval 10
store_clean_interval 60
"@

# Write the config file with UTF8 encoding
$mosquittoConfig | Set-Content -Path "config/mosquitto.conf" -Encoding UTF8

Write-Host "✅ Created new configuration file" -ForegroundColor Green

# Verify the file was created correctly
Write-Host ""
Write-Host "📄 Configuration file contents:" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Yellow
Get-Content "config/mosquitto.conf"

Write-Host ""
Write-Host "📊 File information:" -ForegroundColor Yellow
$fileInfo = Get-Item "config/mosquitto.conf"
Write-Host "Path: $($fileInfo.FullName)" -ForegroundColor White
Write-Host "Size: $($fileInfo.Length) bytes" -ForegroundColor White
Write-Host "Encoding: UTF8" -ForegroundColor White

# Test the configuration syntax (if mosquitto is available locally)
Write-Host ""
Write-Host "🧪 Testing configuration..." -ForegroundColor Yellow

try {
    # Try to find mosquitto locally to test config
    $mosquittoExe = Get-Command mosquitto -ErrorAction SilentlyContinue
    if ($mosquittoExe) {
        Write-Host "Testing with local Mosquitto..." -ForegroundColor Gray
        $testResult = & mosquitto -c "config/mosquitto.conf" -v 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Configuration syntax is valid" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Configuration test returned code $LASTEXITCODE" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Local Mosquitto not found, will test in Docker" -ForegroundColor Gray
    }
} catch {
    Write-Host "Will test configuration in Docker container" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🐳 Starting Docker services..." -ForegroundColor Yellow

try {
    # Start services
    docker-compose up -d
    
    Write-Host "✅ Docker services started" -ForegroundColor Green
    
    # Wait a moment for startup
    Start-Sleep -Seconds 5
    
    # Check Mosquitto logs
    Write-Host ""
    Write-Host "📋 Mosquitto startup logs:" -ForegroundColor Yellow
    docker-compose logs --tail=20 mosquitto
    
    # Test if Mosquitto is responding
    Write-Host ""
    Write-Host "🔍 Testing Mosquitto connection..." -ForegroundColor Yellow
    
    $mosquittoStatus = docker-compose exec mosquitto mosquitto_pub -h localhost -t test -m "hello" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Mosquitto is responding to connections" -ForegroundColor Green
    } else {
        Write-Host "❌ Mosquitto connection test failed" -ForegroundColor Red
        Write-Host "Error: $mosquittoStatus" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Failed to start Docker services: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Mosquitto fix completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Verification commands:" -ForegroundColor Cyan
Write-Host "  docker-compose logs mosquitto" -ForegroundColor White
Write-Host "  docker-compose ps" -ForegroundColor White
Write-Host "  docker-compose exec mosquitto mosquitto_pub -h localhost -t test -m hello" -ForegroundColor White
Write-Host