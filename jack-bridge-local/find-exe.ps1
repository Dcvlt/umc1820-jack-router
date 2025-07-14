# simple-find.ps1
# Simple executable finder

Write-Host "Looking for built executable..." -ForegroundColor Cyan
Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow
Write-Host ""

# Find all .exe files
$exeFiles = Get-ChildItem -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue

if ($exeFiles) {
    Write-Host "Found executable files:" -ForegroundColor Green
    foreach ($exe in $exeFiles) {
        $relativePath = $exe.FullName.Replace((Get-Location), ".")
        $sizeKB = [math]::Round($exe.Length / 1KB, 1)
        Write-Host "  $relativePath ($sizeKB KB)" -ForegroundColor White
    }
} else {
    Write-Host "No .exe files found" -ForegroundColor Red
}

Write-Host ""
Write-Host "Checking Release directory:" -ForegroundColor Yellow
if (Test-Path "Release") {
    Get-ChildItem "Release" | Format-Table Name, Length -AutoSize
} else {
    Write-Host "Release directory not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "Checking Debug directory:" -ForegroundColor Yellow  
if (Test-Path "Debug") {
    Get-ChildItem "Debug" | Format-Table Name, Length -AutoSize
} else {
    Write-Host "Debug directory not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "CMake project name:" -ForegroundColor Yellow
if (Test-Path "CMakeCache.txt") {
    $projectName = Select-String "CMAKE_PROJECT_NAME:STATIC=(.+)" CMakeCache.txt
    if ($projectName) {
        Write-Host $projectName.Matches.Groups[1].Value -ForegroundColor White
    } else {
        Write-Host "Project name not found in CMakeCache.txt" -ForegroundColor Red
    }
} else {
    Write-Host "CMakeCache.txt not found" -ForegroundColor Red
}