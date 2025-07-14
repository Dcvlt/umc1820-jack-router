# fix-missing-directories.ps1
# Quick fix for missing directories

Write-Host "🔧 Fixing missing directories..." -ForegroundColor Yellow

# Check what files actually exist
$requiredFiles = @(
    "jack-bridge/src/main-windows.cpp",
    "jack-bridge/CMakeLists.txt", 
    "jack-bridge/startup.ps1",
    "jack-bridge/healthcheck.ps1",
    "jack-bridge/Dockerfile.windows"
)

Write-Host ""
Write-Host "📋 Checking required files:" -ForegroundColor Cyan

$allExist = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "✅ Found: $file" -ForegroundColor Green
    } else {
        Write-Host "❌ Missing: $file" -ForegroundColor Red
        $allExist = $false
    }
}

# Create build-scripts directory (even if empty)
$buildScriptsDir = "jack-bridge/build-scripts"
if (-not (Test-Path $buildScriptsDir)) {
    New-Item -ItemType Directory -Path $buildScriptsDir -Force | Out-Null
    Write-Host "✅ Created: $buildScriptsDir" -ForegroundColor Green
}

# Create a placeholder build script
$buildScriptContent = @'
@echo off
REM Placeholder build script
echo This is a placeholder build script for the container
echo The actual build happens in the Dockerfile
'@

$buildScriptPath = "$buildScriptsDir/build-windows.bat"
if (-not (Test-Path $buildScriptPath)) {
    Set-Content -Path $buildScriptPath -Value $buildScriptContent
    Write-Host "✅ Created: $buildScriptPath" -ForegroundColor Green
}

Write-Host ""
if ($allExist) {
    Write-Host "🎉 All required files exist! Ready to build." -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Next steps:" -ForegroundColor Cyan
    Write-Host "1. Use the updated Dockerfile.windows (Fixed Paths artifact)" -ForegroundColor White
    Write-Host "2. Run: docker-compose -f docker-compose-windows.yml build" -ForegroundColor White
    Write-Host "3. Run: docker-compose -f docker-compose-windows.yml up -d" -ForegroundColor White
} else {
    Write-Host "❌ Missing files need to be created first" -ForegroundColor Red
    Write-Host ""
    Write-Host "📝 Create these files from the artifacts:" -ForegroundColor Yellow
    $requiredFiles | Where-Object { -not (Test-Path $_) } | ForEach-Object {
        Write-Host "   $_" -ForegroundColor White
    }
}

Write-Host ""