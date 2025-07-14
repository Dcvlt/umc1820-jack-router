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