param(
    [switch]$PullLatestImages
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

Write-Host "PipeGenie fix verification (Docker)"
Write-Host "Project: $projectRoot"

if ($PullLatestImages) {
    Write-Host "Pulling latest images for test profile..."
    docker compose --profile test pull
}

Write-Host "Running backend sample tests in isolated container..."
docker compose --profile test run --rm backend-tests

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "PASS: Docker test verification succeeded."
    Write-Host "You can proceed with demo narration: diagnose -> fix -> verify."
    exit 0
}

Write-Host ""
Write-Host "FAIL: Docker test verification failed."
Write-Host "Check output above, update fix logic, then re-run .\verify-fix.ps1"
exit $LASTEXITCODE
