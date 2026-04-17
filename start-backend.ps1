param(
    [int]$Port = 8000,
    [switch]$Reload
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$venvPython = Join-Path $projectRoot "backend\venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    throw "Virtual environment not found at backend\venv. Create it first with: python -m venv backend\venv"
}

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
    $pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    Write-Host "Found existing listener(s) on port ${Port}: $($pids -join ', '). Stopping..."
    foreach ($procId in $pids) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

$args = @("-m", "uvicorn", "backend.main:app", "--port", $Port)
if ($Reload) {
    $args += "--reload"
}

Write-Host "Starting PipeGenie backend on port $Port using project venv..."
if ($Reload) {
    Write-Host "Reload mode enabled."
}
& $venvPython @args
