# Dockerfile for C++ JACK Bridge Service - Simplified Version
FROM ubuntu:22.04 AS base

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build stage
FROM base AS build

# Copy source code
COPY src/main.cpp ./src/
COPY CMakeLists.txt ./

# Create build directory and compile
RUN mkdir build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release && \
    make -j$(nproc)

# Runtime stage
FROM ubuntu:22.04 AS runtime

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -r jackbridge && useradd -r -g jackbridge jackbridge

WORKDIR /app

# Copy built binary
COPY --from=build /app/build/jack-bridge ./

# Create required directories
RUN mkdir -p state logs && \
    chown -R jackbridge:jackbridge /app

USER jackbridge

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:6666/health || exit 1

EXPOSE 6666

CMD ["./jack-bridge"]