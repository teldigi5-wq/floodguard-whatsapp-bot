param([string]$DatabaseUrl = 'https://floodguard-e3215-default-rtdb.asia-southeast1.firebasedatabase.app')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repo = Split-Path -Parent $PSScriptRoot
$file = Join-Path $repo '.env'
try {
  $version = (& node --version 2>$null).Trim()
  if ([int](($version -replace '^v','').Split('.')[0]) -lt 20) { throw 'Node version is too old' }
} catch { throw 'Install Node.js 20+ before running setup.' }
if (Test-Path -LiteralPath $file) {
  Write-Host 'Existing private .env preserved; no secrets overwritten.'
  exit 0
}
if ($DatabaseUrl -notmatch '^https://[a-zA-Z0-9.-]+\.(firebasedatabase\.app|firebaseio\.com)/?$') {
  throw 'Only an HTTPS Firebase RTDB origin is allowed'
}
$data = Join-Path $repo 'data'
New-Item -ItemType Directory -Path $data -Force | Out-Null
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$token = ([System.BitConverter]::ToString($bytes)).Replace('-','')
$lines = @(
  'FLOODGUARD_HOST_MODE=pc'
  'PORT=8080'
  'HOST=127.0.0.1'
  'DATA_PATH=./data'
  ('FIREBASE_DATABASE_URL=' + $DatabaseUrl.TrimEnd('/'))
  'FIREBASE_AUTH='
  'FLOODGUARD_STALE_MS=15000'
  'WATER_SENSOR_TO_BOTTOM_CM=25'
  ('FLOODGUARD_SETUP_TOKEN=' + $token)
)
$stream = [System.IO.File]::Open($file,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
try {
  $writer = [System.IO.StreamWriter]::new($stream,[System.Text.UTF8Encoding]::new($false))
  try { $writer.WriteLine(($lines -join [Environment]::NewLine)) } finally { $writer.Dispose() }
} finally { $stream.Dispose() }
Write-Host 'Created local data directory and private .env; token is in .env only.'
Write-Host 'Next (offline only): npm ci ; npm test ; npm run doctor ; npm run drill:offline ; npm run start:demo'
Write-Host 'Offline demo: http://127.0.0.1:8085 (username admin; private password from .env). Do not start a live bot or pair WhatsApp.'
