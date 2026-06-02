# ManuSilva — servidor local (um único processo na porta 3456)
$port = 3456
$root = $PSScriptRoot

Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Set-Location $root
Write-Host "ManuSilva PWA em http://127.0.0.1:$port/index.html" -ForegroundColor Green
Write-Host "Parar: Ctrl+C" -ForegroundColor DarkGray
python -m http.server $port --bind 127.0.0.1
