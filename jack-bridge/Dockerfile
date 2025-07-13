# jack-bridge/Dockerfile
# Temporary Node.js Bridge Service (replaces C++ for now)

FROM node:18-alpine

# Install system dependencies for Windows command execution
RUN apk add --no-cache curl bash

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy application
COPY app.js ./

# Create required directories
RUN mkdir -p logs state

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:6666/health || exit 1

EXPOSE 6666 6667

CMD ["node", "app.js"]