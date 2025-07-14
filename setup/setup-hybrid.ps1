# setup-hybrid.ps1
# Setup script for hybrid JACK Audio Router (Local C++ + Docker)

param(
    [switch]$Force,
    [switch]$SkipBuild,
    [switch]$DevMode
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 JACK Audio Router Hybrid Setup" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Architecture: Local C++ Bridge + Docker Services" -ForegroundColor Yellow
Write-Host ""

# Step 1: Clean up project if needed
Write-Host "🧹 Step 1: Project Cleanup" -ForegroundColor Yellow
Write-Host "==========================" -ForegroundColor Yellow

$cleanupResponse = "y"
if (-not $Force) {
    $cleanupResponse = Read-Host "Clean up obsolete Docker Windows container files? (y/N)"
}

if ($cleanupResponse -eq "y" -or $cleanupResponse -eq "Y" -or $Force) {
    if (Test-Path "cleanup-project.ps1") {
        Write-Host "Running cleanup script..." -ForegroundColor Cyan
        .\cleanup-project.ps1
    } else {
        Write-Host "⚠️ Cleanup script not found, skipping..." -ForegroundColor Yellow
    }
} else {
    Write-Host "Skipping cleanup..." -ForegroundColor Gray
}

Write-Host ""

# Step 2: Create project structure
Write-Host "📁 Step 2: Project Structure" -ForegroundColor Yellow
Write-Host "=============================" -ForegroundColor Yellow

$directories = @(
    "jack-bridge-local",
    "jack-bridge-local/src",
    "jack-bridge-local/include",
    "config",
    "logs",
    "ssl",
    "state"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✅ Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "ℹ️ Exists: $dir" -ForegroundColor Gray
    }
}

# Copy configuration files
Write-Host ""
Write-Host "📋 Creating configuration files..." -ForegroundColor Cyan

# Copy mosquitto config to correct location
if (-not (Test-Path "config/mosquitto.conf")) {
    # Create mosquitto config content directly since we have it in the artifact
    $mosquittoContent = @"
# Mosquitto MQTT Broker Configuration
listener 1883
bind_address 0.0.0.0
allow_anonymous true

listener 7777
protocol websockets
bind_address 0.0.0.0
allow_anonymous true

persistence true
persistence_location /mosquitto/data/
log_dest file /mosquitto/log/mosquitto.log
log_dest stdout
log_type error
log_type warning
log_type notice
log_type information
connection_messages true
log_timestamp true

keepalive_interval 60
max_connections -1
max_queued_messages 1000
max_inflight_messages 20
retain_available true
"@
    Set-Content -Path "config/mosquitto.conf" -Value $mosquittoContent
    Write-Host "✅ Created: config/mosquitto.conf" -ForegroundColor Green
}

Write-Host ""

# Step 3: Check prerequisites
Write-Host "🔍 Step 3: Prerequisites Check" -ForegroundColor Yellow
Write-Host "===============================" -ForegroundColor Yellow

$allPrereqsOk = $true

# Check Docker
try {
    $dockerVersion = docker --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker: $dockerVersion" -ForegroundColor Green
    } else {
        Write-Host "❌ Docker not responding" -ForegroundColor Red
        $allPrereqsOk = $false
    }
} catch {
    Write-Host "❌ Docker not found" -ForegroundColor Red
    $allPrereqsOk = $false
}

# Check Docker Compose
try {
    $composeVersion = docker-compose --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker Compose: $composeVersion" -ForegroundColor Green
    } else {
        Write-Host "❌ Docker Compose not found" -ForegroundColor Red
        $allPrereqsOk = $false
    }
} catch {
    Write-Host "❌ Docker Compose not found" -ForegroundColor Red
    $allPrereqsOk = $false
}

# Check JACK2 installation
$jackPaths = @(
    "C:\Program Files\JACK2",
    "C:\Program Files (x86)\JACK2",
    "C:\JACK2"
)

$jackFound = $false
$jackPath = ""

foreach ($path in $jackPaths) {
    if (Test-Path "$path\includes\jack\jack.h") {
        $jackPath = $path
        $jackFound = $true
        Write-Host "✅ JACK2: Found at $path" -ForegroundColor Green
        break
    }
}

if (-not $jackFound) {
    Write-Host "❌ JACK2 not found" -ForegroundColor Red
    Write-Host "   Download from: https://jackaudio.org/downloads/" -ForegroundColor Yellow
    $allPrereqsOk = $false
}

# Check Visual Studio Build Tools
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vsWhere) {
    $vsInstances = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 2>$null
    if ($vsInstances) {
        Write-Host "✅ Visual Studio Build Tools: Found" -ForegroundColor Green
    } else {
        Write-Host "❌ Visual Studio Build Tools not found" -ForegroundColor Red
        $allPrereqsOk = $false
    }
} else {
    Write-Host "⚠️ Visual Studio installer not found" -ForegroundColor Yellow
}

# Check CMake
try {
    $cmakeVersion = cmake --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ CMake: Found" -ForegroundColor Green
    } else {
        Write-Host "❌ CMake not found" -ForegroundColor Red
        $allPrereqsOk = $false
    }
} catch {
    Write-Host "❌ CMake not found" -ForegroundColor Red
    Write-Host "   Download from: https://cmake.org/download/" -ForegroundColor Yellow
    $allPrereqsOk = $false
}

if (-not $allPrereqsOk) {
    Write-Host ""
    Write-Host "❌ Prerequisites check failed. Please install missing components." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 4: Build C++ Bridge
Write-Host "🔨 Step 4: Build C++ JACK Bridge" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow

if (-not $SkipBuild) {
    if (-not (Test-Path "jack-bridge-local/src/main.cpp")) {
        Write-Host "❌ main.cpp not found in jack-bridge-local/src/" -ForegroundColor Red
        Write-Host "   Please copy the main.cpp file from the artifact above" -ForegroundColor Yellow
        exit 1
    }
    
    if (-not (Test-Path "jack-bridge-local/CMakeLists.txt")) {
        Write-Host "❌ CMakeLists.txt not found in jack-bridge-local/" -ForegroundColor Red
        Write-Host "   Please copy the CMakeLists.txt file from the artifact above" -ForegroundColor Yellow
        exit 1
    }
    
    Set-Location "jack-bridge-local"
    
    try {
        if (Test-Path "build.ps1") {
            Write-Host "Running build script..." -ForegroundColor Cyan
            .\build.ps1 -BuildType Release
        } else {
            Write-Host "Build script not found, running CMake manually..." -ForegroundColor Cyan
            
            if (-not (Test-Path "build")) {
                New-Item -ItemType Directory -Name "build" | Out-Null
            }
            
            Set-Location "build"
            
            cmake .. -G "Visual Studio 17 2022" -A x64 -DCMAKE_BUILD_TYPE=Release
            cmake --build . --config Release --parallel
            
            Set-Location ".."
        }
        
        Set-Location ".."
        Write-Host "✅ C++ Bridge built successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ C++ Bridge build failed: $_" -ForegroundColor Red
        Set-Location ".."
        exit 1
    }
} else {
    Write-Host "⏭️ Skipping C++ build (--SkipBuild specified)" -ForegroundColor Yellow
}

Write-Host ""

# Step 5: Setup Docker services
Write-Host "🐳 Step 5: Docker Services Setup" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow

try {
    Write-Host "Building Docker images..." -ForegroundColor Cyan
    
    if ($DevMode) {
        docker-compose build jack-router-dev
        Write-Host "✅ Development Docker image built" -ForegroundColor Green
    } else {
        docker-compose build jack-router
        Write-Host "✅ Production Docker image built" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Docker build failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 6: Final instructions
Write-Host "📋 Step 6: Startup Instructions" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Yellow

Write-Host ""
Write-Host "🎯 Ready to start! Follow these steps:" -ForegroundColor Green
Write-Host ""

Write-Host "1. 🎛️ Start JACK2 on Windows:" -ForegroundColor Cyan
Write-Host "   - Open qjackctl (JACK Control)" -ForegroundColor White
Write-Host "   - Configure your audio interface" -ForegroundColor White
Write-Host "   - Click 'Start' to start JACK server" -ForegroundColor White
Write-Host ""

Write-Host "2. 🌉 Start the local C++ Bridge:" -ForegroundColor Cyan
Write-Host "   cd jack-bridge-local" -ForegroundColor Gray
if (Test-Path "jack-bridge-local/build/jack-bridge.exe") {
    Write-Host "   .\build\jack-bridge.exe" -ForegroundColor Gray
} else {
    Write-Host "   .\jack-bridge.exe" -ForegroundColor Gray
}
Write-Host ""

Write-Host "3. 🐳 Start Docker services:" -ForegroundColor Cyan
if ($DevMode) {
    Write-Host "   docker-compose --profile dev up -d" -ForegroundColor Gray
} else {
    Write-Host "   docker-compose up -d" -ForegroundColor Gray
}
Write-Host ""

Write-Host "4. 🌐 Access the application:" -ForegroundColor Cyan
Write-Host "   - Web Interface: https://localhost:5556" -ForegroundColor White
Write-Host "   - API: https://localhost:5556/api" -ForegroundColor White
Write-Host "   - Bridge API: http://localhost:6666" -ForegroundColor White
Write-Host "   - MQTT: mqtt://localhost:1883" -ForegroundColor White
Write-Host ""

Write-Host "5. 🏠 Home Assistant Integration:" -ForegroundColor Cyan
Write-Host "   - Iframe URL: https://localhost:5556" -ForegroundColor White
Write-Host "   - MQTT Discovery: mqtt://localhost:1883" -ForegroundColor White
Write-Host ""

Write-Host "📝 Quick Start Commands:" -ForegroundColor Yellow
Write-Host "========================" -ForegroundColor Yellow
Write-Host ""

# Create a quick start script
$quickStartContent = @"
@echo off
echo Starting JACK Audio Router Hybrid Setup
echo =======================================
echo.

echo 1. Starting local C++ Bridge...
cd jack-bridge-local
start /B jack-bridge.exe
cd ..

timeout /t 3 >nul

echo 2. Starting Docker services...
$(if ($DevMode) { "docker-compose --profile dev up -d" } else { "docker-compose up -d" })

echo.
echo 3. Services started!
echo    Web Interface: https://localhost:5556
echo    Bridge API: http://localhost:6666  
echo    MQTT: mqtt://localhost:1883
echo.
echo Press any key to continue...
pause >nul
"@

Set-Content -Path "start-services.bat" -Value $quickStartContent
Write-Host "✅ Created: start-services.bat" -ForegroundColor Green

# Create stop script
$stopScriptContent = @"
@echo off
echo Stopping JACK Audio Router Services
echo ===================================

echo Stopping Docker services...
docker-compose down

echo Stopping C++ Bridge...
taskkill /F /IM jack-bridge.exe 2>nul

echo Services stopped.
pause
"@

Set-Content -Path "stop-services.bat" -Value $stopScriptContent
Write-Host "✅ Created: stop-services.bat" -ForegroundColor Green

Write-Host ""
Write-Host "🎉 Hybrid setup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Pro tip: Run 'start-services.bat' for quick startup" -ForegroundColor Cyan
Write-Host ""