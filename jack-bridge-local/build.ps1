# build-fixed.ps1
# Build script for local Windows JACK Bridge

param(
    [string]$BuildType = "Release",
    [switch]$Clean,
    [switch]$Verbose,
    [switch]$Install
)

$ErrorActionPreference = "Stop"

Write-Host "Building JACK Bridge Local" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan
Write-Host ""

# Change to jack-bridge-local directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "Working directory: $(Get-Location)" -ForegroundColor Yellow
Write-Host "Build type: $BuildType" -ForegroundColor Yellow
Write-Host ""

# Check for required tools
Write-Host "Checking build requirements..." -ForegroundColor Yellow

# Check CMake
try {
    $cmakeVersion = cmake --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        $versionLine = ($cmakeVersion -split "`n")[0]
        Write-Host "CMake found: $versionLine" -ForegroundColor Green
    } else {
        throw "CMake not responding"
    }
} catch {
    Write-Host "CMake not found. Please install CMake from https://cmake.org/" -ForegroundColor Red
    exit 1
}

# Check Visual Studio Build Tools
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vsWhere) {
    $vsInstances = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 2>$null
    if ($vsInstances) {
        Write-Host "Visual Studio Build Tools found" -ForegroundColor Green
    } else {
        Write-Host "Visual Studio Build Tools not found" -ForegroundColor Red
        Write-Host "Please install Visual Studio 2019/2022 with C++ tools" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "Visual Studio installer not found, assuming build tools are available" -ForegroundColor Yellow
}

# Check for JACK2
Write-Host ""
Write-Host "Checking JACK2 installation..." -ForegroundColor Yellow

$jackPaths = @(
    "C:\Program Files\JACK2",
    "C:\Program Files (x86)\JACK2", 
    "C:\JACK2"
)

$jackFound = $false
$jackPath = ""

foreach ($path in $jackPaths) {
    if (Test-Path "$path\include\jack\jack.h") {
        $jackPath = $path
        $jackFound = $true
        Write-Host "JACK2 found at: $path" -ForegroundColor Green
        break
    }
}

if (-not $jackFound) {
    Write-Host "JACK2 not found in standard locations" -ForegroundColor Red
    Write-Host "Please install JACK2 from https://jackaudio.org/downloads/" -ForegroundColor Yellow
    Write-Host "Or set JACK_PATH environment variable" -ForegroundColor Yellow
    exit 1
}

# Clean build directory if requested
if ($Clean -and (Test-Path "build")) {
    Write-Host ""
    Write-Host "Cleaning build directory..." -ForegroundColor Yellow
    Remove-Item -Path "build" -Recurse -Force
    Write-Host "Build directory cleaned" -ForegroundColor Green
}

# Create build directory
if (-not (Test-Path "build")) {
    New-Item -ItemType Directory -Name "build" | Out-Null
    Write-Host "Created build directory" -ForegroundColor Green
}

Set-Location "build"

Write-Host ""
Write-Host "Configuring with CMake..." -ForegroundColor Yellow

# Configure with CMake
$cmakeArgs = @(
    "..",
    "-G", "Visual Studio 17 2022",
    "-A", "x64",
    "-DCMAKE_BUILD_TYPE=$BuildType"
)

if ($env:JACK_PATH) {
    $cmakeArgs += "-DJACK_PATH=$env:JACK_PATH"
}

try {
    if ($Verbose) {
        & cmake @cmakeArgs
    } else {
        & cmake @cmakeArgs 2>&1 | Out-Null
    }
    
    if ($LASTEXITCODE -ne 0) {
        throw "CMake configuration failed"
    }
    
    Write-Host "CMake configuration completed" -ForegroundColor Green
} catch {
    Write-Host "CMake configuration failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Building project..." -ForegroundColor Yellow

# Build the project
try {
    $buildArgs = @(
        "--build", ".",
        "--config", $BuildType,
        "--parallel"
    )
    
    if ($Verbose) {
        & cmake @buildArgs
    } else {
        & cmake @buildArgs 2>&1 | Out-Null
    }
    
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed"
    }
    
    Write-Host "Build completed successfully" -ForegroundColor Green
} catch {
    Write-Host "Build failed: $_" -ForegroundColor Red
    exit 1
}

# Check if executable was created (check multiple possible locations)
$possiblePaths = @(
    "jack-bridge.exe",
    "Release\jack-bridge.exe", 
    "Debug\jack-bridge.exe",
    "jack-bridge-local.exe",
    "Release\jack-bridge-local.exe",
    "Debug\jack-bridge-local.exe"
)

$exePath = $null
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $exePath = $path
        Write-Host "Executable created: $exePath" -ForegroundColor Green
        break
    }
}

if (-not $exePath) {
    Write-Host "Executable not found in expected locations" -ForegroundColor Red
    Write-Host "Checking what was actually built..." -ForegroundColor Yellow
    Get-ChildItem -Recurse -Filter "*.exe" | ForEach-Object { 
        Write-Host "Found: $($_.FullName)" -ForegroundColor Gray 
    }
    exit 1
}

# Install if requested
if ($Install) {
    Write-Host ""
    Write-Host "Installing..." -ForegroundColor Yellow
    
    try {
        & cmake --install . --config $BuildType
        Write-Host "Installation completed" -ForegroundColor Green
    } catch {
        Write-Host "Installation failed: $_" -ForegroundColor Red
    }
}

# Copy configuration file
$configSource = "jack-bridge.conf"
$configDest = "../jack-bridge.conf"

if ((Test-Path $configSource) -and (-not (Test-Path $configDest))) {
    Copy-Item $configSource $configDest
    Write-Host "Created configuration file: jack-bridge.conf" -ForegroundColor Green
}

Write-Host ""
Write-Host "Build Summary" -ForegroundColor Green
Write-Host "=============" -ForegroundColor Green
Write-Host "Executable: $(Resolve-Path $exePath)" -ForegroundColor White
Write-Host "Build type: $BuildType" -ForegroundColor White
Write-Host "JACK path: $jackPath" -ForegroundColor White

# Check file size
$fileSize = (Get-Item $exePath).Length
$fileSizeMB = [math]::Round($fileSize / 1MB, 2)
Write-Host "File size: $fileSizeMB MB" -ForegroundColor White

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Ensure JACK2 is running (start qjackctl)" -ForegroundColor White
Write-Host "2. Run: .\jack-bridge.exe" -ForegroundColor White  
Write-Host "3. Test: curl http://localhost:6666/health" -ForegroundColor White
Write-Host "4. Update Docker services to use localhost:6666" -ForegroundColor White
Write-Host ""

Set-Location ".."