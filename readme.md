# JACK Audio Router - Hybrid Architecture

## Overview

This is a hybrid setup that combines:

- **Local C++ Service**: Direct Windows JACK2 API access
- **Docker Services**: Node.js web interface, MQTT broker, and other services

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Windows Host  │    │  Docker Network │    │ Home Assistant  │
│                 │    │                 │    │                 │
│  ┌───────────┐  │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│  │   JACK2   │  │    │ │   Router    │ │    │ │   Iframe    │ │
│  │  Server   │  │    │ │ (Node.js)   │ │    │ │   Widget    │ │
│  └─────┬─────┘  │    │ └──────┬──────┘ │    │ └─────────────┘ │
│        │        │    │        │        │    │                 │
│  ┌─────▼─────┐  │    │ ┌──────▼──────┐ │    │                 │
│  │    C++    │◄─┼────┼─┤    MQTT     │ │    │                 │
│  │  Bridge   │  │    │ │   Broker    │ │    │                 │
│  │:6666      │  │    │ │             │ │    │                 │
│  └───────────┘  │    │ └─────────────┘ │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Quick Start

### 1. Run the setup script:

```powershell
.\setup-hybrid.ps1
```

### 2. Start JACK2:

- Open `qjackctl`
- Configure your audio interface
- Click "Start"

### 3. Start services:

```powershell
.\start-services.bat
```

### 4. Access the interface:

- Web: https://localhost:5556
- API: https://localhost:5556/api

## Manual Setup

### Prerequisites

- Windows 10/11
- JACK2 for Windows
- Docker Desktop
- Visual Studio Build Tools 2022
- CMake

### Build C++ Bridge

```powershell
cd jack-bridge-local
.\build.ps1
```

### Start Docker Services

```bash
docker-compose up -d
```

## Configuration

### C++ Bridge (`jack-bridge-local/jack-bridge.conf`)

```ini
# API port
port=6666

# Log file location
log_file=jack-bridge.log

# Enable verbose logging
verbose=false
```

### Docker Services (`.env`)

```bash
# JACK Bridge connection
JACK_BRIDGE_HOST=host.docker.internal
JACK_BRIDGE_PORT=6666

# MQTT settings
MQTT_ENABLED=true
MQTT_HOST=mqtt://mosquitto:1883

# SSL settings
SSL_AUTO_GENERATE=true
FORCE_HTTPS=true
```

## API Endpoints

### C++ Bridge (localhost:6666)

- `GET /health` - Service health
- `GET /status` - JACK status
- `GET /ports` - List JACK ports
- `GET /connections` - List connections
- `POST /connect` - Connect ports
- `POST /disconnect` - Disconnect ports
- `POST /clear` - Clear all connections

### Node.js Router (localhost:5556)

- `GET /api/status` - System status
- `GET /api/presets` - Available presets
- `POST /api/preset/{name}` - Apply preset
- Full REST API for connection management

## Home Assistant Integration

### Iframe Widget

```yaml
# Add to your dashboard
- type: iframe
  url: https://localhost:5556
  title: JACK Audio Router
```

### MQTT Discovery

The system automatically publishes Home Assistant discovery messages to:

- `homeassistant/switch/jack_audio/*/config`
- `homeassistant/button/jack_audio/*/config`
- `homeassistant/sensor/jack_audio/*/config`

## Troubleshooting

### C++ Bridge Issues

1. **Build fails**: Check Visual Studio Build Tools 2022 installation
2. **JACK not found**: Install JACK2 or set `JACK_PATH` environment variable
3. **Connection refused**: Ensure JACK server is running (qjackctl)

### Docker Issues

1. **Build fails**: Check Docker Desktop is running
2. **Port conflicts**: Ensure ports 5555, 5556, 1883 are available
3. **Bridge connection fails**: Check `host.docker.internal` resolves

### JACK Issues

1. **No audio devices**: Configure audio interface in qjackctl
2. **High latency**: Reduce buffer size in JACK settings
3. **Dropouts**: Increase buffer size or sample rate

## Development

### Development Mode

```powershell
.\setup-hybrid.ps1 -DevMode
docker-compose --profile dev up -d
```

### Hot Reload

The development setup includes:

- Vite dev server (port 5173)
- Node.js debug port (9229)
- File watching and auto-restart

### Logs

- C++ Bridge: `jack-bridge-local/jack-bridge.log`
- Docker services: `docker-compose logs -f`
- Router logs: `logs/jack-router.log`

## File Structure

```
project-root/
├── jack-bridge-local/          # Local C++ bridge
│   ├── src/main.cpp           # C++ source code
│   ├── CMakeLists.txt         # Build configuration
│   ├── build.ps1              # Build script
│   └── jack-bridge.conf       # Configuration
├── config/                     # Configuration files
│   └── mosquitto.conf         # MQTT broker config
├── docker-compose.yml         # Docker services
├── setup-hybrid.ps1           # Setup script
├── start-services.bat         # Quick start
├── stop-services.bat          # Quick stop
└── README-HYBRID.md           # This file
```

## Performance

### C++ Bridge Benefits

- Direct JACK API access (no overhead)
- Native Windows performance
- Minimal latency
- Real-time audio processing

### Docker Benefits

- Isolated services
- Easy deployment
- MQTT broker included
- SSL termination
- Web interface

## Security

### SSL/TLS

- Auto-generated self-signed certificates
- HTTPS required for Home Assistant
- Configurable CORS origins

### MQTT

- Anonymous access (development)
- Configurable authentication
- Home Assistant discovery

## License

This project is open source. See individual component licenses for details.
