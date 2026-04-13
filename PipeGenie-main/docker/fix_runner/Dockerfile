FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install common CI/CD tools
RUN pip install --no-cache-dir \
    pytest \
    poetry \
    black \
    flake8 \
    mypy \
    requests \
    httpx

WORKDIR /workspace

# Default entrypoint runs whatever script is passed
ENTRYPOINT ["/bin/bash"]
