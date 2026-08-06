$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
$bundledRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node'
$bundledNode = Join-Path $bundledRuntime 'bin\node.exe'
$bundledPnpm = Join-Path $bundledRuntime 'node_modules\pnpm\bin\pnpm.mjs'

if (-not (Test-Path -LiteralPath $bundledNode) -or -not (Test-Path -LiteralPath $bundledPnpm)) {
  throw 'The bundled Node.js runtime was not found. Reopen Codex or install Node.js and pnpm.'
}

function Test-ListeningPort {
  param([int]$Port)

  try {
    return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1)
  } catch {
    return $false
  }
}

function Start-LearningService {
  param([string[]]$Arguments)

  Start-Process -FilePath $bundledNode -ArgumentList (@($bundledPnpm) + $Arguments) -WorkingDirectory $projectRoot -WindowStyle Hidden
}

if (-not (Test-ListeningPort -Port 3100)) {
  Start-LearningService -Arguments @('--filter', '@learning-library/api', 'dev')
}

if (-not (Test-ListeningPort -Port 5173)) {
  Start-LearningService -Arguments @('--filter', '@learning-library/web', 'dev', '--host', '127.0.0.1')
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  if ((Test-ListeningPort -Port 3100) -and (Test-ListeningPort -Port 5173)) {
    if ($env:LEARNING_LIBRARY_NO_BROWSER -ne '1') {
      Start-Process 'http://127.0.0.1:5173'
    }
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

throw 'The Learning Library did not start within 15 seconds. Keep this window open and send the error text to Codex.'