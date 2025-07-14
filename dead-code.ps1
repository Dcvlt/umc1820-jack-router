# quick-fix-imports.ps1
# Quick fix for broken imports - copy existing files to correct locations

Write-Host "🚀 Quick Fix for Broken Imports" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan
Write-Host ""

# Create missing directories
$directories = @(
    "constants",
    "src\components", 
    "hooks"
)

Write-Host "📁 Creating directories..." -ForegroundColor Yellow
foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  ✅ Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "  ℹ️ Exists: $dir" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "📄 Files to copy manually:" -ForegroundColor Yellow
Write-Host "==========================" -ForegroundColor Yellow

# Files that exist in artifacts and need to be in correct locations
$filesToCopy = @(
    @{
        Source = "From artifacts above"
        Dest = "constants/constants.cjs"
        Status = if (Test-Path "constants/constants.cjs") { "✅ EXISTS" } else { "❌ MISSING" }
    },
    @{
        Source = "From artifacts above"  
        Dest = "constants/themeConstants.js"
        Status = if (Test-Path "constants/themeConstants.js") { "✅ EXISTS" } else { "❌ MISSING" }
    },
    @{
        Source = "From artifacts above"
        Dest = "hooks/useAudioRouter.js" 
        Status = if (Test-Path "hooks/useAudioRouter.js") { "✅ EXISTS" } else { "❌ MISSING" }
    },
    @{
        Source = "From artifacts above"
        Dest = "src/components/loadingScreen.jsx"
        Status = if (Test-Path "src/components/loadingScreen.jsx") { "✅ EXISTS" } else { "❌ MISSING" }
    },
    @{
        Source = "From artifacts above"
        Dest = "src/components/themeControls.jsx"
        Status = if (Test-Path "src/components/themeControls.jsx") { "✅ EXISTS" } else { "❌ MISSING" }
    },
    @{
        Source = "From artifacts above"
        Dest = "src/components/statusBar.jsx"
        Status = if (Test-Path "src/components/statusBar.jsx") { "✅ EXISTS" } else { "❌ MISSING" }
    },
    @{
        Source = "From artifacts above"
        Dest = "src/components/messages.jsx"
        Status = if (Test-Path "src/components/messages.jsx") { "✅ EXISTS" } else { "❌ MISSING" }
    },
    @{
        Source = "From artifacts above"
        Dest = "src/components/presetControls.jsx"
        Status = if (Test-Path "src/components/presetControls.jsx") { "✅ EXISTS" } else { "❌ MISSING" }
    },
    @{
        Source = "From artifacts above"
        Dest = "src/components/connectionMatrix.jsx"
        Status = if (Test-Path "src/components/connectionMatrix.jsx") { "✅ EXISTS" } else { "❌ MISSING" }
    },
    @{
        Source = "From artifacts above"
        Dest = "src/components/toast.jsx"
        Status = if (Test-Path "src/components/toast.jsx") { "✅ EXISTS" } else { "❌ MISSING" }
    }
)

foreach ($file in $filesToCopy) {
    Write-Host "  $($file.Status) $($file.Dest)" -ForegroundColor $(if ($file.Status -match "EXISTS") { "Green" } else { "Red" })
}

Write-Host ""
Write-Host "🔧 Quick Actions:" -ForegroundColor Yellow
Write-Host "=================" -ForegroundColor Yellow

# Check if files exist and provide copy commands
$missingFiles = $filesToCopy | Where-Object { $_.Status -match "MISSING" }

if ($missingFiles.Count -eq 0) {
    Write-Host "✅ All files exist! No action needed." -ForegroundColor Green
} else {
    Write-Host "❌ Missing files detected. Copy these files:" -ForegroundColor Red
    Write-Host ""
    
    foreach ($file in $missingFiles) {
        Write-Host "📋 Copy to: $($file.Dest)" -ForegroundColor Cyan
        Write-Host "   Source: Look for this file in the artifacts provided earlier" -ForegroundColor Gray
        Write-Host ""
    }
}

Write-Host ""
Write-Host "🧪 Test after copying:" -ForegroundColor Yellow
Write-Host "======================" -ForegroundColor Yellow
Write-Host "npm run dev" -ForegroundColor Gray

Write-Host ""
Write-Host "🧹 Clean up backup files:" -ForegroundColor Yellow
Write-Host "=========================" -ForegroundColor Yellow

$backupFiles = @(
    "audio_router_state.backup.json",
    "docker-compose.yml.backup"
)

foreach ($backup in $backupFiles) {
    if (Test-Path $backup) {
        Write-Host "  ❌ Remove: $backup" -ForegroundColor Red
        $response = Read-Host "    Delete $backup? (y/N)"
        if ($response -eq "y") {
            Remove-Item $backup -Force
            Write-Host "    ✅ Deleted: $backup" -ForegroundColor Green
        }
    } else {
        Write-Host "  ✅ Clean: $backup (not found)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "===========" -ForegroundColor Cyan

$existingCount = ($filesToCopy | Where-Object { $_.Status -match "EXISTS" }).Count
$totalCount = $filesToCopy.Count

Write-Host "Files status: $existingCount/$totalCount exist" -ForegroundColor White

if ($existingCount -eq $totalCount) {
    Write-Host "🎉 All imports should work!" -ForegroundColor Green
} else {
    Write-Host "⚠️ Copy missing files from artifacts to fix imports" -ForegroundColor Yellow
}

Write-Host ""