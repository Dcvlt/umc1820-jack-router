# Multi-stage Dockerfile for JACK Audio Router
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    curl \
    bash \
    make \
    g++ \
    python3 \
    py3-pip \
    git \
    openssl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development
RUN npm ci && npm cache clean --force
COPY . .
EXPOSE 3001 3443 5173 9229
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
COPY . .
RUN npm ci && npm run build

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    bash \
    openssl \
    tini

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# Copy built application
COPY --from=build --chown=nextjs:nodejs /app/dist ./dist
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/package*.json ./
COPY --from=build --chown=nextjs:nodejs /app/server.js ./
COPY --from=build --chown=nextjs:nodejs /app/config ./config
COPY --from=build --chown=nextjs:nodejs /app/routes ./routes
COPY --from=build --chown=nextjs:nodejs /app/services ./services
COPY --from=build --chown=nextjs:nodejs /app/utils ./utils
COPY --from=build --chown=nextjs:nodejs /app/middleware ./middleware
COPY --from=build --chown=nextjs:nodejs /app/constants ./constants
COPY --from=build --chown=nextjs:nodejs /app/hooks ./hooks
COPY --from=build --chown=nextjs:nodejs /app/components ./components

# Create required directories
RUN mkdir -p ssl state logs && \
    chown nextjs:nodejs ssl state logs

USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

EXPOSE 3001 3443

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]