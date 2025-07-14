# setup-project-structure.ps1
# Create the required project structure and files for Windows containers

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "🏗️ Setting up JACK Audio Router Project Structure" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Project directories to create
$directories = @(
    "jack-bridge",
    "jack-bridge/src",
    "jack-bridge/build-scripts",
    "mosquitto/config",
    "logs",
    "ssl",
    "state"
)

# Create directories
Write-Host "📁 Creating project directories..." -ForegroundColor Yellow
foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✅ Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "ℹ️ Exists: $dir" -ForegroundColor Cyan
    }
}

# Create .gitignore for jack-bridge build artifacts
$gitignoreContent = @"
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
"@

Write-Host ""
Write-Host "📄 Creating configuration files..." -ForegroundColor Yellow

# Create jack-bridge/.gitignore
$gitignoreFile = "jack-bridge/.gitignore"
if (-not (Test-Path $gitignoreFile) -or $Force) {
    Set-Content -Path $gitignoreFile -Value $gitignoreContent
    Write-Host "✅ Created: $gitignoreFile" -ForegroundColor Green
} else {
    Write-Host "ℹ️ Exists: $gitignoreFile" -ForegroundColor Cyan
}

# Create mosquitto config
$mosquittoConfig = @"
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
"@

$mosquittoConfigFile = "mosquitto/config/mosquitto.conf"
if (-not (Test-Path $mosquittoConfigFile) -or $Force) {
    Set-Content -Path $mosquittoConfigFile -Value $mosquittoConfig
    Write-Host "✅ Created: $mosquittoConfigFile" -ForegroundColor Green
} else {
    Write-Host "ℹ️ Exists: $mosquittoConfigFile" -ForegroundColor Cyan
}

# Create CMakeLists.txt for jack-bridge
$cmakeContent = @"
cmake_minimum_required(VERSION 3.16)
project(jack-bridge-windows VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler flags
set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -Wall -DDEBUG")
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")

# Find JACK2 installation
set(JACK_ROOT "C:/Program Files/JACK2")
find_path(JACK_INCLUDE_DIR jack/jack.h PATHS "`${JACK_ROOT}/includes" NO_DEFAULT_PATH)
find_library(JACK_LIBRARY NAMES libjack64 libjack PATHS "`${JACK_ROOT}/lib" NO_DEFAULT_PATH)

if(NOT JACK_INCLUDE_DIR)
    message(FATAL_ERROR "JACK2 headers not found. Expected at: `${JACK_ROOT}/includes")
endif()

if(NOT JACK_LIBRARY)
    message(FATAL_ERROR "JACK2 library not found. Expected at: `${JACK_ROOT}/lib")
endif()

message(STATUS "JACK Include Dir: `${JACK_INCLUDE_DIR}")
message(STATUS "JACK Library: `${JACK_LIBRARY}")

# Source files
set(SOURCES src/main-windows.cpp)

# Create executable
add_executable(`${PROJECT_NAME} `${SOURCES})

# Include directories
target_include_directories(`${PROJECT_NAME} PRIVATE `${JACK_INCLUDE_DIR})

# Link libraries
target_link_libraries(`${PROJECT_NAME} PRIVATE `${JACK_LIBRARY} ws2_32 wsock32)

# Windows-specific definitions
target_compile_definitions(`${PROJECT_NAME} PRIVATE
    _WIN32_WINNT=0x0601
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    UNICODE
    _UNICODE
)

# Set output directory
set_target_properties(`${PROJECT_NAME} PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY `${CMAKE_BINARY_DIR}
)

# Installation
install(TARGETS `${PROJECT_NAME} RUNTIME DESTINATION bin)

# Print configuration summary
message(STATUS "")
message(STATUS "JACK Bridge Windows Configuration:")
message(STATUS "==================================")
message(STATUS "Build type: `${CMAKE_BUILD_TYPE}")
message(STATUS "C++ standard: `${CMAKE_CXX_STANDARD}")
message(STATUS "Output directory: `${CMAKE_BINARY_DIR}")
message(STATUS "")
"@

$cmakeFile = "jack-bridge/CMakeLists.txt"
if (-not (Test-Path $cmakeFile) -or $Force) {
    Set-Content -Path $cmakeFile -Value $cmakeContent
    Write-Host "✅ Created: $cmakeFile" -ForegroundColor Green
} else {
    Write-Host "ℹ️ Exists: $cmakeFile" -ForegroundColor Cyan
}

# Create build script for Windows
$buildScript = @"
@echo off
REM build-windows.bat - Build script for Windows container

echo Building JACK Bridge Service for Windows Container...

REM Setup Visual Studio environment
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

REM Create build directory
if not exist build mkdir build
cd build

REM Configure CMake for Windows
cmake .. -G "Visual Studio 17 2022" -A x64 ^
    -DCMAKE_BUILD_TYPE=Release

REM Build the project
cmake --build . --config Release --parallel

REM Copy executable to parent directory
copy Release\jack-bridge-windows.exe ..\jack-bridge.exe

cd ..

echo.
echo Build completed successfully!
echo Executable: jack-bridge.exe
"@

$buildScriptFile = "jack-bridge/build-scripts/build-windows.bat"
if (-not (Test-Path $buildScriptFile) -or $Force) {
    Set-Content -Path $buildScriptFile -Value $buildScript
    Write-Host "✅ Created: $buildScriptFile" -ForegroundColor Green
} else {
    Write-Host "ℹ️ Exists: $buildScriptFile" -ForegroundColor Cyan
}

# Create README for jack-bridge
$readmeContent = @"
# JACK Bridge Windows Container

This directory contains the Windows container implementation for the JACK Audio Bridge service.

## Files

- `Dockerfile.windows` - Windows container definition
- `src/main-windows.cpp` - C++ source code with native JACK API
- `CMakeLists.txt` - CMake build configuration
- `build-scripts/build-windows.bat` - Build script for Windows

## Building

### In Container (automatic):
The Dockerfile handles the build process automatically.

### Local Development:
1. Install JACK2 for Windows
2. Install Visual Studio Build Tools 2022
3. Run: `build-scripts\build-windows.bat`

## Requirements

- Windows Server Core container
- JACK2 for Windows (automatically installed in container)
- Visual Studio Build Tools 2022 (automatically installed in container)
- CMake (automatically installed in container)

## API Endpoints

- `GET /health` - Service health check
- `GET /status` - JACK status
- `GET /ports` - List JACK ports
- `GET /connections` - List JACK connections
- `POST /connect` - Connect two ports
- `POST /disconnect` - Disconnect two ports
- `POST /clear` - Clear all connections
"@

$readmeFile = "jack-bridge/README.md"
if (-not (Test-Path $readmeFile) -or $Force) {
    Set-Content -Path $readmeFile -Value $readmeContent
    Write-Host "✅ Created: $readmeFile" -ForegroundColor Green
} else {
    Write-Host "ℹ️ Exists: $readmeFile" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "✅ Project structure created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Copy the Dockerfile.windows to jack-bridge/" -ForegroundColor White
Write-Host "2. Copy the main-windows.cpp to jack-bridge/src/" -ForegroundColor White
Write-Host "3. Copy the docker-compose-windows.yml to project root" -ForegroundColor White
Write-Host "4. Run: .\setup-windows-containers.ps1" -ForegroundColor White
Write-Host ""
Write-Host "💡 Files to create from artifacts:" -ForegroundColor Yellow
Write-Host "- jack-bridge/Dockerfile.windows" -ForegroundColor White
Write-Host "- jack-bridge/src/main-windows.cpp" -ForegroundColor White
Write-Host "- docker-compose-windows.yml" -ForegroundColor White
Write-Host ""