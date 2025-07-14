# install-prerequisites-fixed.ps1
# Install build prerequisites for JACK Bridge

param(
    [switch]$SkipJack,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "Building Prerequisites Installer" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "Warning: This script should be run as Administrator for best results" -ForegroundColor Yellow
    Write-Host "Some installations may fail without admin privileges" -ForegroundColor Yellow
    Write-Host ""
}

# Function to check if a command exists
function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# 1. Check CMake
Write-Host "Checking CMake..." -ForegroundColor Yellow
if (-not (Test-Command "cmake")) {
    Write-Host "CMake not found. Please install CMake manually:" -ForegroundColor Red
    Write-Host "1. Download from: https://cmake.org/download/" -ForegroundColor White
    Write-Host "2. Choose 'Windows x64 Installer'" -ForegroundColor White
    Write-Host "3. During installation, select 'Add CMake to system PATH'" -ForegroundColor White
    Write-Host ""
    
    $response = Read-Host "Open CMake download page now? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Start-Process "https://cmake.org/download/"
    }
} else {
    $cmakeVersion = (cmake --version | Select-Object -First 1)
    Write-Host "CMake found: $cmakeVersion" -ForegroundColor Green
}

# 2. Check Visual Studio Build Tools
Write-Host ""
Write-Host "Checking Visual Studio Build Tools..." -ForegroundColor Yellow

$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasBuildTools = $false

if (Test-Path $vsWhere) {
    try {
        $vsInstances = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 2>$null
        if ($vsInstances) {
            Write-Host "Visual Studio Build Tools found" -ForegroundColor Green
            $hasBuildTools = $true
        }
    } catch {
        # Ignore errors
    }
}

if (-not $hasBuildTools) {
    Write-Host "Visual Studio Build Tools not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual installation required:" -ForegroundColor Yellow
    Write-Host "1. Download Visual Studio Build Tools 2022" -ForegroundColor White
    Write-Host "2. URL: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022" -ForegroundColor White
    Write-Host "3. Run the installer" -ForegroundColor White
    Write-Host "4. Select 'C++ build tools'" -ForegroundColor White
    Write-Host "5. Install MSVC v143 compiler toolset" -ForegroundColor White
    Write-Host "6. Install Windows 10/11 SDK" -ForegroundColor White
    Write-Host ""
    
    $response = Read-Host "Open download page now? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Start-Process "https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022"
    }
}

# 3. Check JACK2
if (-not $SkipJack) {
    Write-Host ""
    Write-Host "Checking JACK2..." -ForegroundColor Yellow
    
    $jackPaths = @(
        "C:\Program Files\JACK2",
        "C:\Program Files (x86)\JACK2",
        "C:\JACK2"
    )
    
    $jackFound = $false
    foreach ($path in $jackPaths) {
        if (Test-Path "$path\include\jack\jack.h") {
            Write-Host "JACK2 found at: $path" -ForegroundColor Green
            $jackFound = $true
            break
        }
    }
    
    if (-not $jackFound) {
        Write-Host "JACK2 not found" -ForegroundColor Red
        Write-Host ""
        Write-Host "Manual installation required:" -ForegroundColor Yellow
        Write-Host "1. Download from: https://jackaudio.org/downloads/" -ForegroundColor White
        Write-Host "2. Choose 'JACK2 for Windows'" -ForegroundColor White
        Write-Host "3. Install to default location" -ForegroundColor White
        Write-Host ""
        
        $response = Read-Host "Open download page now? (y/N)"
        if ($response -eq 'y' -or $response -eq 'Y') {
            Start-Process "https://jackaudio.org/downloads/"
        }
    }
} else {
    Write-Host "Skipping JACK2 check" -ForegroundColor Yellow
}

# 4. Final verification
Write-Host ""
Write-Host "Final Verification" -ForegroundColor Yellow
Write-Host "==================" -ForegroundColor Yellow

$allGood = $true

# Check CMake
if (Test-Command "cmake") {
    Write-Host "CMake: Ready" -ForegroundColor Green
} else {
    Write-Host "CMake: Not found in PATH" -ForegroundColor Red
    Write-Host "Try restarting PowerShell or reboot after installation" -ForegroundColor Yellow
    $allGood = $false
}

# Check Visual Studio
if (Test-Path $vsWhere) {
    try {
        $vsInstances = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 2>$null
        if ($vsInstances) {
            Write-Host "Visual Studio Build Tools: Ready" -ForegroundColor Green
        } else {
            Write-Host "Visual Studio Build Tools: Not found" -ForegroundColor Red
            $allGood = $false
        }
    } catch {
        Write-Host "Visual Studio Build Tools: Not found" -ForegroundColor Red
        $allGood = $false
    }
} else {
    Write-Host "Visual Studio Build Tools: Not found" -ForegroundColor Red
    $allGood = $false
}

# Check JACK2
if (-not $SkipJack) {
    $jackFound = $false
    $jackPaths = @(
        "C:\Program Files\JACK2",
        "C:\Program Files (x86)\JACK2", 
        "C:\JACK2"
    )
    
    foreach ($path in $jackPaths) {
        if (Test-Path "$path\include\jack\jack.h") {
            Write-Host "JACK2: Ready at $path" -ForegroundColor Green
            $jackFound = $true
            break
        }
    }
    if (-not $jackFound) {
        Write-Host "JACK2: Not found" -ForegroundColor Red
        $allGood = $false
    }
}

Write-Host ""
if ($allGood) {
    Write-Host "All prerequisites ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. cd jack-bridge-local" -ForegroundColor White
    Write-Host "2. Copy the source files from artifacts" -ForegroundColor White
    Write-Host "3. Run: .\build.ps1" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "Some prerequisites missing" -ForegroundColor Red
    Write-Host "Please install missing components and run again" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Pro tip: Restart PowerShell after installing to refresh PATH" -ForegroundColor Cyan
Write-Host ""