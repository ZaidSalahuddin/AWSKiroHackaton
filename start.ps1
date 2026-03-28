# VT Dining Ranker - Start both API and Client
Write-Host "Starting VT Dining Ranker..." -ForegroundColor Cyan

# Start API in background
Write-Host "Starting API on http://localhost:3000 ..." -ForegroundColor Green
$api = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\api'; npm start" -PassThru

# Give API a moment to boot
Start-Sleep -Seconds 2

# Start Expo web client
Write-Host "Starting Expo client (web) on http://localhost:8081 ..." -ForegroundColor Magenta
$client = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\client'; npx expo start --web" -PassThru

Write-Host ""
Write-Host "Both servers are starting in separate windows." -ForegroundColor Yellow
Write-Host "  API:    http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Client: http://localhost:8081" -ForegroundColor Magenta
Write-Host ""
Write-Host "Close those windows to stop the servers." -ForegroundColor Gray
