$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
$bundledRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node'
$bundledNode = Join-Path $bundledRuntime 'bin\node.exe'
$bundledPnpm = Join-Path $bundledRuntime 'node_modules\pnpm\bin\pnpm.mjs'

if (-not (Test-Path -LiteralPath $bundledNode) -or -not (Test-Path -LiteralPath $bundledPnpm)) {
  throw '未找到学习库需要的 Node.js 运行环境。请重新打开 Codex 后再试，或安装 Node.js 22 与 pnpm。'
}

function Test-ListeningPort {
  param([int]$Port)

  return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Start-LearningService {
  param([string]$Command)

  Start-Process -FilePath $bundledNode -ArgumentList @($bundledPnpm, $Command) -WorkingDirectory $projectRoot -WindowStyle Hidden
}

if (-not (Test-ListeningPort -Port 3100)) {
  Start-LearningService -Command 'dev:api'
}

if (-not (Test-ListeningPort -Port 5173)) {
  Start-LearningService -Command 'dev:web'
}

for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try {
    Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 1 | Out-Null
    if ($env:LEARNING_LIBRARY_NO_BROWSER -eq '1') {
      exit 0
    }
    Start-Process 'http://127.0.0.1:5173'
    exit 0
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

throw '学习库未能在 10 秒内启动。请将此错误内容发给 Codex。'
