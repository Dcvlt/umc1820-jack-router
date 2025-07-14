# Multi-stage Dockerfile optimized for development
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
    openssl \
    dumb-init

WORKDIR /app

# Copy package files
COPY package*.json ./

# Development stage (default for development)
FROM base AS development

# Install ALL dependencies (including devDependencies)
RUN npm ci && npm cache clean --force

# Install development tools globally
RUN npm install -g nodemon concurrently

# Create required directories
RUN mkdir -p ssl state logs src routes services utils middleware components hooks constants config

# Copy source files (but they'll be overridden by volume mounts)
COPY . .

# Set proper permissions
RUN chown -R node:node /app
USER node

# Expose all development ports
EXPOSE 5555 5556 5173 9229

# Development command with hot reload
CMD ["npm", "run", "dev"]

# Production stage (opt-in with profiles)
FROM base AS production

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Install runtime dependencies
RUN apk add --no-cache tini

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy built application
COPY --chown=nextjs:nodejs . .

# Create required directories
RUN mkdir -p ssl state logs && \
    chown nextjs:nodejs ssl state logs

USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5555/health || exit 1

EXPOSE 5555 5556

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "dev"]