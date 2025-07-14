# troubleshoot-windows-containers.ps1
# Troubleshoot Windows container issues

Write-Host "🔍 Troubleshooting Windows Container Issues" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "⚠️ NOT running as Administrator" -ForegroundColor Yellow
    Write-Host "   Some Docker operations may fail without admin privileges" -ForegroundColor Yellow
} else {
    Write-Host "✅ Running as Administrator" -ForegroundColor Green
}

Write-Host ""
Write-Host "🐳 Checking Docker configuration..." -ForegroundColor Yellow

# Check Docker version
try {
    $dockerVersion = docker --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker version: $dockerVersion" -ForegroundColor Green
    } else {
        Write-Host "❌ Docker not responding" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Docker not found" -ForegroundColor Red
    exit 1
}

# Check Docker daemon info
try {
    Write-Host ""
    Write-Host "🔍 Checking Docker daemon..." -ForegroundColor Yellow
    
    $dockerInfo = docker info 2>$null
    if ($LASTEXITCODE -eq 0) {
        # Check OS Type
        $osType = ($dockerInfo | Select-String "OSType:").ToString().Split(":")[1].Trim()
        if ($osType -eq "windows") {
            Write-Host "✅ Docker is in Windows container mode" -ForegroundColor Green
        } else {
            Write-Host "❌ Docker is in Linux container mode" -ForegroundColor Red
            Write-Host "   You need to switch to Windows containers" -ForegroundColor Yellow
            Write-Host "   Right-click Docker Desktop → Switch to Windows containers" -ForegroundColor Yellow
            exit 1
        }
        
        # Check storage driver
        $storageDriver = ($dockerInfo | Select-String "Storage Driver:").ToString().Split(":")[1].Trim()
        Write-Host "ℹ️ Storage Driver: $storageDriver" -ForegroundColor Cyan
        
    } else {
        Write-Host "❌ Docker daemon not responding" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Failed to get Docker info" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔧 Potential fixes for the base image error:" -ForegroundColor Yellow
Write-Host ""

Write-Host "1. 🔄 Clean Docker system:" -ForegroundColor Cyan
Write-Host "   docker system prune -f" -ForegroundColor Gray
Write-Host "   docker image prune -a -f" -ForegroundColor Gray
Write-Host ""

Write-Host "2. 🗑️ Remove corrupted base image:" -ForegroundColor Cyan
Write-Host "   docker rmi mcr.microsoft.com/windows/servercore:ltsc2022" -ForegroundColor Gray
Write-Host ""

Write-Host "3. 🔄 Restart Docker Desktop:" -ForegroundColor Cyan
Write-Host "   Right-click Docker Desktop → Restart" -ForegroundColor Gray
Write-Host ""

Write-Host "4. 🆕 Try a different base image:" -ForegroundColor Cyan
Write-Host "   Use mcr.microsoft.com/windows/servercore:ltsc2019" -ForegroundColor Gray
Write-Host "   Or mcr.microsoft.com/windows/nanoserver:ltsc2022" -ForegroundColor Gray
Write-Host ""

Write-Host "5. 📀 Check available disk space:" -ForegroundColor Cyan
$disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object -ExpandProperty FreeSpace
$diskGB = [math]::Round($disk / 1GB, 1)
Write-Host "   Available: ${diskGB}GB (need at least 20GB)" -ForegroundColor Gray

if ($diskGB -lt 20) {
    Write-Host "   ❌ Insufficient disk space!" -ForegroundColor Red
} else {
    Write-Host "   ✅ Sufficient disk space" -ForegroundColor Green
}

Write-Host ""
Write-Host "🎯 Recommended immediate actions:" -ForegroundColor Green
Write-Host "1. Run the cleanup commands above" -ForegroundColor White
Write-Host "2. Restart Docker Desktop" -ForegroundColor White
Write-Host "3. Try building again" -ForegroundColor White
Write-Host "4. If still failing, switch to ltsc2019 base image" -ForegroundColor White
Write-Host ""

# Offer to run cleanup
$response = Read-Host "Would you like me to run Docker cleanup now? (y/N)"
if ($response -eq 'y' -or $response -eq 'Y') {
    Write-Host ""
    Write-Host "🧹 Running Docker cleanup..." -ForegroundColor Yellow
    
    try {
        Write-Host "   Pruning system..." -ForegroundColor Gray
        docker system prune -f
        
        Write-Host "   Removing corrupted base image..." -ForegroundColor Gray
        docker rmi mcr.microsoft.com/windows/servercore:ltsc2022 -f 2>$null
        
        Write-Host "✅ Cleanup completed" -ForegroundColor Green
        Write-Host ""
        Write-Host "🔄 Please restart Docker Desktop and try building again" -ForegroundColor Cyan
        
    } catch {
        Write-Host "❌ Cleanup failed: $_" -ForegroundColor Red
    }
}