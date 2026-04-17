# Starts SigNoz via official Docker Compose (UI at http://localhost:8080 by default).
# Prerequisites: Docker Desktop running, Git on PATH, ~4GB+ RAM for Docker.
# Docs: https://signoz.io/docs/install/docker/

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$workDir = Join-Path $projectRoot ".signoz"
$repoPath = Join-Path $workDir "signoz"
$composeDir = Join-Path $repoPath "deploy\docker"
$composeFile = Join-Path $composeDir "docker-compose.yaml"
$overrideFile = Join-Path $projectRoot "docker-compose.signoz-override.yml"

if (-not (Test-Path $composeFile)) {
    Write-Host "Cloning SigNoz (one-time clone into .signoz\signoz)..."
    New-Item -ItemType Directory -Force -Path $workDir | Out-Null
    if (-not (Test-Path (Join-Path $repoPath ".git"))) {
        git clone -b main --depth 1 https://github.com/SigNoz/signoz.git $repoPath
    }
}

if (-not (Test-Path $composeFile)) {
    throw "SigNoz docker compose not found at: $composeFile"
}

Push-Location $composeDir
try {
    Write-Host "Starting SigNoz stack (docker compose up -d)..."
    if (Test-Path $overrideFile) {
        docker compose -f docker-compose.yaml -f $overrideFile up -d --remove-orphans
    } else {
        docker compose up -d --remove-orphans
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "If pulls failed with Docker Hub rate limit: docker login"
        Write-Host "Then re-run this script."
        exit $LASTEXITCODE
    }
    Write-Host ""
    Write-Host "UI: http://localhost:8080  |  OTLP HTTP: http://localhost:4318"
    if (Test-Path $overrideFile) {
        Write-Host "Login (local dev): admin@pipegenie.local / admin"
    }
    Write-Host "PipeGenie: set OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 (or http://127.0.0.1:4318)"
} finally {
    Pop-Location
}
