#!/bin/bash
# scripts/deploy.sh
# Production deployment script for JACK Audio Router

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_DIR="/opt/jack-audio-router"
BACKUP_DIR="/opt/jack-audio-router/backups"
SERVICE_NAME="jack-audio-router"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root for security reasons"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log "🔍 Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        exit 1
    fi
    
    # Check disk space (require at least 2GB free)
    available_space=$(df / | awk 'NR==2 {print $4}')
    required_space=$((2 * 1024 * 1024)) # 2GB in KB
    
    if [[ $available_space -lt $required_space ]]; then
        error "Insufficient disk space. Required: 2GB, Available: $((available_space / 1024 / 1024))GB"
        exit 1
    fi
    
    log "✅ Prerequisites check passed"
}

# Setup production directories
setup_directories() {
    log "📁 Setting up production directories..."
    
    # Create deployment directory structure
    sudo mkdir -p "${DEPLOYMENT_DIR}"/{data/{jack-state,router-state},logs/{router,bridge,nginx},ssl,config,backups}
    
    # Set permissions
    sudo chown -R $USER:$USER "${DEPLOYMENT_DIR}"
    chmod 755 "${DEPLOYMENT_DIR}"
    
    # Create subdirectory permissions
    chmod 750 "${DEPLOYMENT_DIR}/ssl"
    chmod 755 "${DEPLOYMENT_DIR}/logs"
    chmod 755 "${DEPLOYMENT_DIR}/data"
    
    log "✅ Production directories created"
}

# Copy configuration files
setup_configuration() {
    log "⚙️ Setting up production configuration..."
    
    # Copy production environment file
    if [[ -f "${PROJECT_DIR}/docker.env.production" ]]; then
        cp "${PROJECT_DIR}/docker.env.production" "${DEPLOYMENT_DIR}/.env"
    else
        cp "${PROJECT_DIR}/docker.env.example" "${DEPLOYMENT_DIR}/.env"
        warn "Using example environment file. Please review ${DEPLOYMENT_DIR}/.env"
    fi
    
    # Copy docker-compose files
    cp "${PROJECT_DIR}/docker-compose.prod.yml" "${DEPLOYMENT_DIR}/docker-compose.yml"
    
    # Copy configuration files
    cp -r "${PROJECT_DIR}/config" "${DEPLOYMENT_DIR}/"
    cp -r "${PROJECT_DIR}/mosquitto" "${DEPLOYMENT_DIR}/"
    
    # Copy nginx configuration if using proxy
    if [[ -d "${PROJECT_DIR}/nginx" ]]; then
        cp -r "${PROJECT_DIR}/nginx" "${DEPLOYMENT_DIR}/"
    fi
    
    log "✅ Configuration files copied"
}

# Setup SSL certificates
setup_ssl() {
    log "🔒 Setting up SSL certificates..."
    
    if [[ -d "${PROJECT_DIR}/ssl" ]] && [[ -f "${PROJECT_DIR}/ssl/certificate.crt" ]]; then
        # Copy existing certificates
        cp -r "${PROJECT_DIR}/ssl"/* "${DEPLOYMENT_DIR}/ssl/"
        log "✅ SSL certificates copied from project"
    else
        # Generate self-signed certificates for production
        warn "No production SSL certificates found. Generating self-signed certificates..."
        
        openssl req -x509 -newkey rsa:4096 \
            -keyout "${DEPLOYMENT_DIR}/ssl/private.key" \
            -out "${DEPLOYMENT_DIR}/ssl/certificate.crt" \
            -days 365 -nodes \
            -subj "/C=US/ST=Production/L=Server/O=JACK Audio Router/CN=localhost" \
            -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1"
        
        warn "Self-signed certificates generated. Replace with proper certificates for production use."
    fi
    
    # Set proper permissions
    chmod 600 "${DEPLOYMENT_DIR}/ssl/private.key"
    chmod 644 "${DEPLOYMENT_DIR}/ssl/certificate.crt"
    
    log "✅ SSL setup complete"
}

# Create systemd service
create_systemd_service() {
    log "🔧 Creating systemd service..."
    
    cat << EOF | sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null
[Unit]
Description=JACK Audio Router Docker Services
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${DEPLOYMENT_DIR}
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
ExecReload=/usr/bin/docker-compose restart
TimeoutStartSec=300
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable ${SERVICE_NAME}
    
    log "✅ Systemd service created and enabled"
}

# Setup log rotation
setup_log_rotation() {
    log "📋 Setting up log rotation..."
    
    cat << EOF | sudo tee /etc/logrotate.d/${SERVICE_NAME} > /dev/null
${DEPLOYMENT_DIR}/logs/*/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        /usr/bin/docker-compose -f ${DEPLOYMENT_DIR}/docker-compose.yml restart >/dev/null 2>&1 || true
    endscript
}
EOF
    
    log "✅ Log rotation configured"
}

# Setup backup script
setup_backup() {
    log "💾 Setting up backup script..."
    
    cat << 'EOF' > "${DEPLOYMENT_DIR}/backup.sh"
#!/bin/bash
# Automated backup script for JACK Audio Router

BACKUP_DIR="/opt/jack-audio-router/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/jack-router-backup-${DATE}.tar.gz"

echo "Starting backup at $(date)"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Stop services
cd /opt/jack-audio-router
docker-compose stop

# Create backup
tar -czf "${BACKUP_FILE}" \
    --exclude='logs' \
    --exclude='backups' \
    data/ ssl/ config/ .env docker-compose.yml

# Start services
docker-compose start

# Keep only last 7 backups
find "${BACKUP_DIR}" -name "jack-router-backup-*.tar.gz" -mtime +7 -delete

echo "Backup completed: ${BACKUP_FILE}"
echo "Backup size: $(du -h "${BACKUP_FILE}" | cut -f1)"
EOF
    
    chmod +x "${DEPLOYMENT_DIR}/backup.sh"
    
    # Add to crontab (daily backup at 2 AM)
    (crontab -l 2>/dev/null; echo "0 2 * * * ${DEPLOYMENT_DIR}/backup.sh >> ${DEPLOYMENT_DIR}/logs/backup.log 2>&1") | crontab -
    
    log "✅ Backup script created and scheduled"
}

# Build and deploy
deploy() {
    log "🚀 Starting deployment..."
    
    cd "${DEPLOYMENT_DIR}"
    
    # Pull latest images and build
    docker-compose pull
    docker-compose build --no-cache
    
    # Start services
    docker-compose up -d
    
    # Wait for services to be ready
    log "⏳ Waiting for services to start..."
    sleep 30
    
    # Check service health
    check_deployment_health
}

# Check deployment health
check_deployment_health() {
    log "🏥 Checking deployment health..."
    
    local health_checks=(
        "http://localhost:6666/health:JACK Bridge"
        "http://localhost:3001/health:JACK Router"
    )
    
    local all_healthy=true
    
    for check in "${health_checks[@]}"; do
        local url="${check%:*}"
        local service="${check#*:}"
        
        if curl -s -f "$url" >/dev/null 2>&1; then
            log "✅ $service is healthy"
        else
            error "❌ $service is not healthy"
            all_healthy=false
        fi
    done
    
    if $all_healthy; then
        log "🎉 Deployment successful! All services are healthy."
        log "🌐 Web interface: https://localhost:3443"
        log "📡 API endpoint: https://localhost:3443/api"
    else
        error "❌ Deployment completed with health check failures"
        log "📋 Check logs with: cd ${DEPLOYMENT_DIR} && docker-compose logs"
        exit 1
    fi
}

# Create maintenance script
create_maintenance_script() {
    log "🔧 Creating maintenance script..."
    
    cat << EOF > "${DEPLOYMENT_DIR}/maintain.sh"
#!/bin/bash
# Maintenance script for JACK Audio Router

DEPLOYMENT_DIR="${DEPLOYMENT_DIR}"

case "\$1" in
    start)
        echo "Starting JACK Audio Router..."
        cd "\$DEPLOYMENT_DIR" && docker-compose start
        ;;
    stop)
        echo "Stopping JACK Audio Router..."
        cd "\$DEPLOYMENT_DIR" && docker-compose stop
        ;;
    restart)
        echo "Restarting JACK Audio Router..."
        cd "\$DEPLOYMENT_DIR" && docker-compose restart
        ;;
    status)
        echo "JACK Audio Router Status:"
        cd "\$DEPLOYMENT_DIR" && docker-compose ps
        ;;
    logs)
        echo "Recent logs:"
        cd "\$DEPLOYMENT_DIR" && docker-compose logs --tail=50
        ;;
    health)
        echo "Health check:"
        curl -s http://localhost:3001/health | jq . || echo "Router API not responding"
        curl -s http://localhost:6666/health | jq . || echo "Bridge API not responding"
        ;;
    backup)
        echo "Running backup..."
        "\$DEPLOYMENT_DIR/backup.sh"
        ;;
    update)
        echo "Updating services..."
        cd "\$DEPLOYMENT_DIR"
        docker-compose pull
        docker-compose build --no-cache
        docker-compose up -d
        ;;
    *)
        echo "Usage: \$0 {start|stop|restart|status|logs|health|backup|update}"
        exit 1
        ;;
esac
EOF
    
    chmod +x "${DEPLOYMENT_DIR}/maintain.sh"
    
    # Create symlink for easy access
    sudo ln -sf "${DEPLOYMENT_DIR}/maintain.sh" /usr/local/bin/jack-router
    
    log "✅ Maintenance script created. Use 'jack-router <command>' to control the service"
}

# Main deployment function
main() {
    log "🎵 JACK Audio Router Production Deployment"
    log "========================================"
    
    check_root
    check_prerequisites
    setup_directories
    setup_configuration
    setup_ssl
    create_systemd_service
    setup_log_rotation
    setup_backup
    deploy
    create_maintenance_script
    
    log ""
    log "🎉 Deployment Complete!"
    log "======================"
    log "Web Interface: https://localhost:3443"
    log "API Endpoint: https://localhost:3443/api"
    log "Control Service: jack-router {start|stop|restart|status|logs|health}"
    log "Logs Location: ${DEPLOYMENT_DIR}/logs/"
    log "Backup Location: ${DEPLOYMENT_DIR}/backups/"
    log ""
    log "Next Steps:"
    log "1. Review SSL certificates in ${DEPLOYMENT_DIR}/ssl/"
    log "2. Configure Windows JACK host connection"
    log "3. Test audio routing functionality"
    log "4. Set up monitoring and alerts"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi