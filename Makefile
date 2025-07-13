# Makefile for JACK Audio Router Docker Operations

.PHONY: help build up down dev logs clean restart status health

# Default target
help: ## Show this help message
	@echo "🎵 JACK Audio Router Docker Commands"
	@echo "=================================="
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# Build targets
build: ## Build all Docker images
	@echo "🔨 Building JACK Audio Router images..."
	docker-compose build

build-bridge: ## Build only JACK Bridge service
	@echo "🔨 Building JACK Bridge service..."
	docker-compose build jack-bridge

build-router: ## Build only JACK Router service
	@echo "🔨 Building JACK Router service..."
	docker-compose build jack-router

build-dev: ## Build development images
	@echo "🔨 Building development images..."
	docker-compose build jack-router-dev

# Run targets
up: ## Start all services in production mode
	@echo "🚀 Starting JACK Audio Router services..."
	docker-compose up -d
	@echo "✅ Services started. Access web interface at http://localhost:3001"

dev: ## Start development environment
	@echo "🔧 Starting development environment..."
	docker-compose --profile dev up -d
	@echo "✅ Development environment started."
	@echo "   Web interface: http://localhost:3001"
	@echo "   Vite dev server: http://localhost:5173"

down: ## Stop all services
	@echo "🛑 Stopping JACK Audio Router services..."
	docker-compose down

stop: ## Stop services without removing containers
	@echo "⏸️  Stopping services..."
	docker-compose stop

start: ## Start existing containers
	@echo "▶️  Starting services..."
	docker-compose start

restart: ## Restart all services
	@echo "🔄 Restarting JACK Audio Router services..."
	docker-compose restart

# Logs and monitoring
logs: ## Show logs from all services
	docker-compose logs -f

logs-router: ## Show logs from router service only
	docker-compose logs -f jack-router

logs-bridge: ## Show logs from bridge service only
	docker-compose logs -f jack-bridge

logs-mqtt: ## Show logs from MQTT service only
	docker-compose logs -f mosquitto

# Status and health
status: ## Show status of all containers
	@echo "📊 Container Status"
	@echo "=================="
	docker-compose ps

health: ## Check health of all services
	@echo "🏥 Health Check"
	@echo "==============="
	@docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "API Health Checks:"
	@echo "==================="
	@echo -n "Router API: "
	@curl -s -f http://localhost:3001/health >/dev/null && echo "✅ Healthy" || echo "❌ Unhealthy"
	@echo -n "Bridge API: "
	@curl -s -f http://localhost:6666/health >/dev/null && echo "✅ Healthy" || echo "❌ Unhealthy"

# Shell access
shell-router: ## Get shell access to router container
	docker-compose exec jack-router bash

shell-bridge: ## Get shell access to bridge container
	docker-compose exec jack-bridge bash

shell-mosquitto: ## Get shell access to mosquitto container
	docker-compose exec mosquitto ash

# Development helpers
watch: ## Watch logs from all services with timestamps
	docker-compose logs -f --timestamps

tail: ## Tail logs from all services (last 100 lines)
	docker-compose logs --tail=100

npm-install: ## Install npm dependencies in development container
	docker-compose exec jack-router-dev npm install

npm-build: ## Build production assets in development container
	docker-compose exec jack-router-dev npm run build

# Database and volumes
volumes: ## Show Docker volumes
	@echo "💾 Docker Volumes"
	@echo "================="
	docker volume ls | grep jack

backup-volumes: ## Backup all volumes
	@echo "💾 Backing up volumes..."
	@mkdir -p backups/$(shell date +%Y%m%d_%H%M%S)
	docker run --rm \
		-v jack-audio-router_router-state:/source:ro \
		-v $(PWD)/backups/$(shell date +%Y%m%d_%H%M%S):/backup \
		alpine tar czf /backup/router-state.tar.gz -C /source .
	docker run --rm \
		-v jack-audio-router_jack-state:/source:ro \
		-v $(PWD)/backups/$(shell date +%Y%m%d_%H%M%S):/backup \
		alpine tar czf /backup/jack-state.tar.gz -C /source .
	@echo "✅ Volumes backed up to backups/$(shell date +%Y%m%d_%H%M%S)/"

# Cleanup
clean: ## Clean up containers, networks, and unused images
	@echo "🧹 Cleaning up Docker resources..."
	docker-compose down -v
	docker system prune -f
	@echo "✅ Cleanup complete"

clean-volumes: ## Remove all volumes (⚠️ DESTRUCTIVE)
	@echo "⚠️  This will delete all data volumes. Are you sure? [y/N]"
	@read -r confirm && [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ] || (echo "Cancelled" && exit 1)
	docker-compose down -v
	docker volume rm jack-audio-router_router-state jack-audio-router_jack-state jack-audio-router_mosquitto-data jack-audio-router_redis-data 2>/dev/null || true
	@echo "✅ Volumes removed"

reset: clean-volumes build up ## Complete reset: clean, rebuild, and start

# Production deployment
deploy: ## Deploy to production (build and start)
	@echo "🚀 Deploying JACK Audio Router to production..."
	docker-compose build
	docker-compose up -d
	@echo "✅ Deployed successfully"

# Configuration
config: ## Show parsed docker-compose configuration
	docker-compose config

validate: ## Validate docker-compose configuration
	docker-compose config --quiet && echo "✅ Configuration valid" || echo "❌ Configuration invalid"

# Network inspection
network: ## Show Docker network information
	@echo "🌐 Network Information"
	@echo "====================="
	docker network ls | grep jack
	@echo ""
	docker network inspect jack-audio-router_jack-network 2>/dev/null | jq '.[0].Containers' || echo "Network not found"

# Quick commands
quick-start: build up ## Quick start: build and run
	@echo "🚀 JACK Audio Router is running!"
	@echo "   Web interface: http://localhost:3001"
	@echo "   API health: http://localhost:3001/health"

quick-dev: build-dev dev ## Quick development start
	@echo "🔧 Development environment ready!"
	@echo "   Web interface: http://localhost:3001"
	@echo "   Vite dev server: http://localhost:5173"

# Help for Windows users
windows-help: ## Show Windows-specific instructions
	@echo "🪟 Windows Setup Instructions"
	@echo "============================="
	@echo "1. Install Docker Desktop for Windows"
	@echo "2. Enable WSL2 backend"
	@echo "3. Ensure JACK2 is installed on Windows host"
	@echo "4. Run 'make quick-start' to begin"
	@echo ""
	@echo "Bridge Service will connect to Windows JACK on:"
	@echo "  Host: host.docker.internal"
	@echo "  Tools: C:/PROGRA~1/JACK2/tools/"