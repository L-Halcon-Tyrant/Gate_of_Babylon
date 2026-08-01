$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
$pnpmPath = (Get-Command pnpm.cmd -ErrorAction Stop).Source

function Test-ListeningPort {
  param([int]$Port)

  return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

if (-not (Test-ListeningPort -Port 3100)) {
  Start-Process -FilePath $pnpmPath -ArgumentList 'dev:api' -WorkingDirectory $projectRoot -WindowStyle Hidden
}

if (-not (Test-ListeningPort -Port 5173)) {
  Start-Process -FilePath $pnpmPath -ArgumentList 'dev:web' -WorkingDirectory $projectRoot -WindowStyle Hidden
}

for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try {
    Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 1 | Out-Null
    Start-Process 'http://127.0.0.1:5173'
    exit 0
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

throw '学习库未能在 10 秒内启动。请在项目目录运行 pnpm dev:api 和 pnpm dev:web 查看错误。'
