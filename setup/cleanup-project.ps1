# cleanup-project.ps1
# Clean up obsolete files and organize project for local C++ bridge + Docker

param(
    [switch]$Force,
    [switch]$DryRun
)

Write-Host "🧹 Cleaning up JACK Audio Router Project" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Files and directories to remove (obsolete Windows container stuff)
$filesToRemove = @(
    "docker-compose-windows.yml",
    "docker-compose.override.yml", 
    "docker-compose.prod.yml",
    "docker.env",
    "docker.env.example",
    "fix-missing-directories.ps1",
    "setup-project-structure.ps1",
    "setup-complete-project.ps1",
    "troubleshoot-windows-containers.ps1",
    "scripts/deploy.sh",
    "scripts/docker-setup.sh",
    "jack-bridge/Dockerfile.windows",
    "jack-bridge/startup.ps1",
    "jack-bridge/healthcheck.ps1",
    "jack-bridge/package.json",
    "jack-bridge/app.js",
    "jack-bridge/build-scripts/build-windows.bat",
    "mosquitto/config/mosquitto.conf",
    "Makefile"
)

$directoriesToRemove = @(
    "jack-bridge/build-scripts",
    "mosquitto",
    "nginx",
    "redis",
    "monitoring"
)

# Function to safely remove files/directories
function Remove-SafelyWithConfirmation {
    param(
        [string]$Path,
        [string]$Type = "file"
    )
    
    if (Test-Path $Path) {
        if ($DryRun) {
            Write-Host "  [DRY RUN] Would remove ${Type}: $Path" -ForegroundColor Yellow
            return
        }
        
        try {
            if ($Type -eq "directory") {
                Remove-Item -Path $Path -Recurse -Force
            } else {
                Remove-Item -Path $Path -Force
            }
            Write-Host "  ✅ Removed ${Type}: $Path" -ForegroundColor Green
        } catch {
            Write-Host "  ❌ Failed to remove ${Type}: $Path - $_" -ForegroundColor Red
        }
    } else {
        Write-Host "  ℹ️ Not found: $Path" -ForegroundColor Gray
    }
}

Write-Host "🗑️ Removing obsolete files..." -ForegroundColor Yellow
foreach ($file in $filesToRemove) {
    Remove-SafelyWithConfirmation -Path $file -Type "file"
}

Write-Host ""
Write-Host "📁 Removing obsolete directories..." -ForegroundColor Yellow
foreach ($dir in $directoriesToRemove) {
    Remove-SafelyWithConfirmation -Path $dir -Type "directory"
}

Write-Host ""
Write-Host "📋 Cleaning up package.json..." -ForegroundColor Yellow

# Update package.json to remove Docker-specific scripts
if (Test-Path "package.json") {
    try {
        $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
        
        # Remove Docker-specific scripts
        $scriptsToRemove = @("docker:build", "docker:up", "docker:down", "docker:dev", "docker:logs", "docker:clean")
        
        foreach ($script in $scriptsToRemove) {
            if ($packageJson.scripts.PSObject.Properties.Name -contains $script) {
                $packageJson.scripts.PSObject.Properties.Remove($script)
                Write-Host "  ✅ Removed script: $script" -ForegroundColor Green
            }
        }
        
        if (-not $DryRun) {
            $packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json"
        }
        
    } catch {
        Write-Host "  ❌ Failed to update package.json: $_" -ForegroundColor Red
    }
} else {
    Write-Host "  ⚠️ package.json not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📝 Updating .gitignore..." -ForegroundColor Yellow

$newGitignore = @"
# Dependencies
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Production build
dist
build

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs
*.log

# State files
audio_router_state.json
audio_router_state.backup.json
last_state.json

# SSL certificates
*.crt
*.key
*.pem

# C++ Build artifacts
jack-bridge-local/build/
jack-bridge-local/*.exe
jack-bridge-local/*.obj
jack-bridge-local/*.lib
jack-bridge-local/*.dll
jack-bridge-local/*.pdb

# Visual Studio
.vs/
*.vcxproj.user
*.sln.docstates

# CMake
CMakeCache.txt
CMakeFiles/
cmake_install.cmake
Makefile

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Editor directories
.vscode/
.idea/
*.swp
*.swo
*~
"@

if (-not $DryRun) {
    Set-Content -Path ".gitignore" -Value $newGitignore
    Write-Host "  ✅ Updated .gitignore" -ForegroundColor Green
} else {
    Write-Host "  [DRY RUN] Would update .gitignore" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📁 Creating new project structure..." -ForegroundColor Yellow

$newDirectories = @(
    "jack-bridge-local",
    "jack-bridge-local/src", 
    "jack-bridge-local/include",
    "config/local"
)

foreach ($dir in $newDirectories) {
    if (-not (Test-Path $dir)) {
        if (-not $DryRun) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Host "  ✅ Created: $dir" -ForegroundColor Green
        } else {
            Write-Host "  [DRY RUN] Would create: $dir" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ℹ️ Exists: $dir" -ForegroundColor Gray
    }
}

Write-Host ""
if ($DryRun) {
    Write-Host "🔍 DRY RUN COMPLETE - No files were actually modified" -ForegroundColor Cyan
    Write-Host "Run without -DryRun to apply changes" -ForegroundColor Cyan
} else {
    Write-Host "✅ Project cleanup completed!" -ForegroundColor Green
}

Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Build local C++ JACK bridge" -ForegroundColor White
Write-Host "2. Update docker-compose.yml for hybrid setup" -ForegroundColor White
Write-Host "3. Configure services to connect to local bridge" -ForegroundColor White
Write-Host ""