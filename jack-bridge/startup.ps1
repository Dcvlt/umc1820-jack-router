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