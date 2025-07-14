# fix-docker-networking.ps1
# Script to fix Docker networking for JACK Bridge connectivity

param(
    [switch]$Force
)

Write-Host "🔧 Fixing Docker Networking for JACK Bridge" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Find Docker host IP
Write-Host "1. Finding Docker host IP..." -ForegroundColor Yellow

$dockerHostIP = $null

# Method 1: Check Docker Desktop network
try {
    $dockerNAT = Get-NetAdapter | Where-Object { $_.Name -like "*Docker*" -or $_.Name -like "*vEthernet*" }
    if ($dockerNAT) {
        $ip = Get-NetIPAddress -InterfaceIndex $dockerNAT[0].InterfaceIndex -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne "127.0.0.1" }
        if ($ip) {
            $dockerHostIP = $ip.IPAddress
            Write-Host "   Found Docker host IP via adapter: $dockerHostIP" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "   Method 1 failed, trying alternative..." -ForegroundColor Yellow
}

# Method 2: Common Docker Desktop IPs
if (-not $dockerHostIP) {
    $commonIPs = @("192.168.65.1", "192.168.65.254", "172.17.0.1", "10.0.75.1")
    
    foreach ($ip in $commonIPs) {
        try {
            $test = Test-NetConnection -ComputerName $ip -Port 6666 -WarningAction SilentlyContinue
            if ($test.TcpTestSucceeded) {
                $dockerHostIP = $ip
                Write-Host "   Found working Docker host IP: $dockerHostIP" -ForegroundColor Green
                break
            }
        } catch {
            # Continue to next IP
        }
    }
}

# Method 3: Ask Docker container what it sees
if (-not $dockerHostIP) {
    Write-Host "   Testing from Docker container perspective..." -ForegroundColor Yellow
    try {
        $result = docker run --rm alpine/curl:latest sh -c "ip route show default | awk '/default/ { print `$3 }'" 2>$null
        if ($result -and $result -match "\d+\.\d+\.\d+\.\d+") {
            $dockerHostIP = $result.Trim()
            Write-Host "   Docker container sees host at: $dockerHostIP" -ForegroundColor Green
        }
    } catch {
        Write-Host "   Container test failed" -ForegroundColor Red
    }
}

if (-not $dockerHostIP) {
    Write-Host "❌ Could not determine Docker host IP automatically" -ForegroundColor Red
    Write-Host "   Please manually check Docker Desktop settings" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 2: Test connectivity from Docker
Write-Host "2. Testing connectivity from Docker container..." -ForegroundColor Yellow

$httpTest = docker run --rm alpine/curl:latest curl -s -m 5 "http://${dockerHostIP}:6666/health" 2>$null
if ($httpTest -match "status") {
    Write-Host "   ✅ HTTP API accessible from Docker" -ForegroundColor Green
} else {
    Write-Host "   ❌ HTTP API not accessible from Docker" -ForegroundColor Red
    Write-Host "   This might be a Windows Firewall issue" -ForegroundColor Yellow
}

Write-Host ""

# Step 3: Update docker-compose.yml
Write-Host "3. Updating docker-compose.yml..." -ForegroundColor Yellow

if (Test-Path "docker-compose.yml") {
    # Backup original
    if (-not (Test-Path "docker-compose.yml.backup")) {
        Copy-Item "docker-compose.yml" "docker-compose.yml.backup"
        Write-Host "   📋 Created backup: docker-compose.yml.backup" -ForegroundColor Gray
    }
    
    # Read and update the file
    $content = Get-Content "docker-compose.yml" -Raw
    
    # Replace host.docker.internal with actual IP
    $content = $content -replace "host\.docker\.internal", $dockerHostIP
    
    # Add extra_hosts section if not present
    if ($content -notmatch "extra_hosts:") {
        $extraHostsSection = @"
    extra_hosts:
      - "jack-bridge:$dockerHostIP"
      - "host.docker.internal:$dockerHostIP"
"@
        # Add after networks section for each service
        $content = $content -replace "(networks:\s*\r?\n\s*- jack-network)", "`$1`r`n$extraHostsSection"
    }
    
    Set-Content "docker-compose.yml" $content
    Write-Host "   ✅ Updated docker-compose.yml with IP: $dockerHostIP" -ForegroundColor Green
} else {
    Write-Host "   ❌ docker-compose.yml not found in current directory" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 4: Update environment variables
Write-Host "4. Creating .env file with correct settings..." -ForegroundColor Yellow

$envContent = @"
# Docker networking fix
JACK_BRIDGE_HOST=$dockerHostIP
JACK_BRIDGE_PORT=6666
JACK_BRIDGE_WS_PORT=6667

# MQTT settings
MQTT_ENABLED=true
MQTT_HOST=mqtt://mosquitto:1883

# SSL settings
SSL_AUTO_GENERATE=true
SSL_ENABLED=true
FORCE_HTTPS=true

# Logging
LOG_LEVEL=INFO
LOG_COLORS=false

# Features
FEATURE_SSL_ENABLED=true
FEATURE_MQTT_ENABLED=true
FEATURE_STATE_PERSISTENCE=true
FEATURE_CONNECTION_TRACKING=true
FEATURE_HEALTH_MONITORING=true
"@

Set-Content ".env" $envContent
Write-Host "   ✅ Created .env file with Docker host IP" -ForegroundColor Green

Write-Host ""

# Step 5: Test the fix
Write-Host "5. Testing the complete setup..." -ForegroundColor Yellow

Write-Host "   Stopping existing containers..." -ForegroundColor Gray
docker-compose down 2>$null

Write-Host "   Starting services..." -ForegroundColor Gray
docker-compose up -d

Start-Sleep -Seconds 10

Write-Host "   Testing service health..." -ForegroundColor Gray
$healthTest = docker-compose exec jack-router curl -s http://localhost:5555/health 2>$null
if ($healthTest -match "healthy") {
    Write-Host "   ✅ Service is healthy!" -ForegroundColor Green
} else {
    Write-Host "   ⚠️ Service may still be starting..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Docker networking fix completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Cyan
Write-Host "   Docker Host IP: $dockerHostIP" -ForegroundColor White
Write-Host "   Bridge HTTP:    http://${dockerHostIP}:6666" -ForegroundColor White
Write-Host "   Bridge WebSocket: ws://${dockerHostIP}:6667" -ForegroundColor White
Write-Host "   Web Interface: https://localhost:5556" -ForegroundColor White
Write-Host ""
Write-Host "📊 Check logs with: docker-compose logs -f jack-router" -ForegroundColor Cyan
Write-Host ""

# Optional: Test Windows Firewall
Write-Host "💡 If still having issues, check Windows Firewall:" -ForegroundColor Yellow
Write-Host "   1. Windows Security > Firewall & network protection" -ForegroundColor White
Write-Host "   2. Allow an app through firewall" -ForegroundColor White
Write-Host "   3. Add jack-bridge.exe if not listed" -ForegroundColor White
Write-Host ""