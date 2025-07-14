# setup-complete-project.ps1
# Complete project setup with all required files

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "🏗️ Setting up Complete JACK Audio Router Project" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Create directory structure
$directories = @(
    "jack-bridge",
    "jack-bridge/src",
    "jack-bridge/build-scripts",
    "mosquitto/config",
    "logs",
    "ssl",
    "state"
)

Write-Host "📁 Creating directories..." -ForegroundColor Yellow
foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✅ Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "ℹ️ Exists: $dir" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "📄 Creating required files..." -ForegroundColor Yellow

# Function to create file with content check
function New-ProjectFile {
    param(
        [string]$Path,
        [string]$Content,
        [string]$Description
    )
    
    if (-not (Test-Path $Path) -or $Force) {
        Set-Content -Path $Path -Value $Content -Encoding UTF8
        Write-Host "✅ Created: $Path - $Description" -ForegroundColor Green
    } else {
        Write-Host "ℹ️ Exists: $Path - $Description" -ForegroundColor Cyan
    }
}

# Jack Bridge CMakeLists.txt
$cmakeContent = @'
cmake_minimum_required(VERSION 3.16)
project(jack-bridge-windows VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find JACK2 installation with fallback paths
set(JACK_POSSIBLE_ROOTS 
    "C:/Program Files/JACK2"
    "C:/Program Files (x86)/JACK2"
    "C:/JACK2"
)

foreach(JACK_ROOT_CANDIDATE ${JACK_POSSIBLE_ROOTS})
    if(EXISTS "${JACK_ROOT_CANDIDATE}")
        set(JACK_ROOT "${JACK_ROOT_CANDIDATE}")
        break()
    endif()
endforeach()

if(NOT JACK_ROOT)
    message(FATAL_ERROR "JACK2 installation not found in standard locations")
endif()

message(STATUS "Using JACK2 from: ${JACK_ROOT}")

# Find headers and library
find_path(JACK_INCLUDE_DIR 
    NAMES jack/jack.h
    PATHS "${JACK_ROOT}/includes" "${JACK_ROOT}/include"
    NO_DEFAULT_PATH
)

find_library(JACK_LIBRARY 
    NAMES libjack64 libjack jack
    PATHS "${JACK_ROOT}/lib" "${JACK_ROOT}/lib64"
    NO_DEFAULT_PATH
)

if(NOT JACK_INCLUDE_DIR)
    message(FATAL_ERROR "JACK headers not found. Searched in: ${JACK_ROOT}/includes, ${JACK_ROOT}/include")
endif()

if(NOT JACK_LIBRARY)
    message(FATAL_ERROR "JACK library not found. Searched in: ${JACK_ROOT}/lib, ${JACK_ROOT}/lib64")
endif()

message(STATUS "JACK Include Dir: ${JACK_INCLUDE_DIR}")
message(STATUS "JACK Library: ${JACK_LIBRARY}")

# Source files
set(SOURCES src/main-windows.cpp)

# Create executable
add_executable(${PROJECT_NAME} ${SOURCES})

# Include directories
target_include_directories(${PROJECT_NAME} PRIVATE ${JACK_INCLUDE_DIR})

# Link libraries
target_link_libraries(${PROJECT_NAME} PRIVATE ${JACK_LIBRARY} ws2_32 wsock32)

# Windows-specific definitions
target_compile_definitions(${PROJECT_NAME} PRIVATE
    _WIN32_WINNT=0x0601
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    UNICODE
    _UNICODE
)

# Compiler options
target_compile_options(${PROJECT_NAME} PRIVATE
    $<$<CONFIG:Debug>:/W4 /Od /Zi>
    $<$<CONFIG:Release>:/O2 /DNDEBUG>
)

# Set output directory
set_target_properties(${PROJECT_NAME} PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}
)

install(TARGETS ${PROJECT_NAME} RUNTIME DESTINATION bin)
'@

New-ProjectFile -Path "jack-bridge/CMakeLists.txt" -Content $cmakeContent -Description "CMake build configuration"

# Startup script
$startupContent = @'
# startup.ps1 - Container startup script
Write-Host "🎵 Starting JACK Audio Router Windows Container..."
Write-Host "=============================================="

$jackdPath = "C:\Program Files\JACK2\jackd.exe"
$jackLspPath = "C:\Program Files\JACK2\tools\jack_lsp.exe"

# Check JACK installation
if (-not (Test-Path $jackdPath)) {
    Write-Error "JACK daemon not found at $jackdPath"
    exit 1
}

Write-Host "✅ JACK installation verified"

# Start JACK daemon
Write-Host "🎛️ Starting JACK daemon..."
$jackProcess = Start-Process -FilePath $jackdPath -ArgumentList @(
    "-d", "wasapi",
    "-r", "$env:JACK_SAMPLE_RATE",
    "-p", "$env:JACK_BUFFER_SIZE"
) -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 10

# Verify JACK status
if (Test-Path $jackLspPath) {
    try {
        $jackStatus = & $jackLspPath 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ JACK daemon is running"
            Write-Host "📡 Available ports:"
            $jackStatus | ForEach-Object { Write-Host "   $_" }
        } else {
            Write-Warning "JACK daemon may not be fully ready"
        }
    } catch {
        Write-Warning "Could not verify JACK status: $_"
    }
} else {
    Write-Warning "jack_lsp not found, skipping status check"
}

# Start JACK Bridge service
Write-Host "🌉 Starting JACK Bridge service..."
Write-Host "   API Port: $env:JACK_BRIDGE_API_PORT"

try {
    & "C:\jack-bridge\jack-bridge.exe"
} catch {
    Write-Error "Failed to start JACK Bridge service: $_"
    exit 1
}
'@

New-ProjectFile -Path "jack-bridge/startup.ps1" -Content $startupContent -Description "Container startup script"

# Health check script
$healthCheckContent = @'
# healthcheck.ps1 - Container health check
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$env:JACK_BRIDGE_API_PORT/health" -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        exit 0
    } else {
        exit 1
    }
} catch {
    exit 1
}
'@

New-ProjectFile -Path "jack-bridge/healthcheck.ps1" -Content $healthCheckContent -Description "Health check script"

# Mosquitto config
$mosquittoConfig = @'
# Mosquitto MQTT Broker Configuration
listener 1883
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

# WebSocket support
listener 9001
protocol websockets
allow_anonymous true
'@

New-ProjectFile -Path "mosquitto/config/mosquitto.conf" -Content $mosquittoConfig -Description "MQTT broker config"

# .gitignore for jack-bridge
$gitignoreContent = @'
# Build artifacts
build/
*.exe
*.obj
*.lib
*.dll
*.pdb
*.ilk
*.exp

# Visual Studio
.vs/
*.vcxproj.user
*.sln.docstates

# CMake
CMakeCache.txt
CMakeFiles/
cmake_install.cmake
Makefile

# Logs
*.log
'@

New-ProjectFile -Path "jack-bridge/.gitignore" -Content $gitignoreContent -Description "Git ignore file"

# Build script
$buildScript = @'
@echo off
REM build-windows.bat - Build script for Windows

echo Building JACK Bridge Service for Windows...

REM Setup Visual Studio environment
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

REM Create build directory
if not exist build mkdir build
cd build

REM Configure CMake for Windows
cmake .. -G "Visual Studio 17 2022" -A x64 -DCMAKE_BUILD_TYPE=Release

REM Build the project
cmake --build . --config Release --parallel

REM Copy executable to parent directory
copy Release\jack-bridge-windows.exe ..\jack-bridge.exe

cd ..

echo.
echo Build completed successfully!
echo Executable: jack-bridge.exe
'@

New-ProjectFile -Path "jack-bridge/build-scripts/build-windows.bat" -Content $buildScript -Description "Windows build script"

Write-Host ""
Write-Host "✅ Project setup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Files created:" -ForegroundColor Cyan
Write-Host "   jack-bridge/Dockerfile.windows (copy from artifact)" -ForegroundColor White
Write-Host "   jack-bridge/src/main-windows.cpp (copy from artifact)" -ForegroundColor White
Write-Host "   jack-bridge/CMakeLists.txt ✅" -ForegroundColor Green
Write-Host "   jack-bridge/startup.ps1 ✅" -ForegroundColor Green
Write-Host "   jack-bridge/healthcheck.ps1 ✅" -ForegroundColor Green
Write-Host "   mosquitto/config/mosquitto.conf ✅" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Yellow
Write-Host "1. Copy Dockerfile.windows from the artifact above" -ForegroundColor White
Write-Host "2. Copy main-windows.cpp from the artifact above" -ForegroundColor White
Write-Host "3. Copy docker-compose-windows.yml from the artifact above" -ForegroundColor White
Write-Host "4. Install JACK2 locally (optional): .\install-jack-windows.ps1" -ForegroundColor White
Write-Host "5. Build and start: docker-compose -f docker-compose-windows.yml up -d" -ForegroundColor White
Write-Host ""