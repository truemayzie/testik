# ============================================================
#  Refai - Full Dev Runner (Backend + Frontend)
#  Запуск обоих серверов в отдельных окнах PowerShell
# ============================================================

$backendScript = Join-Path $PSScriptRoot "dev-backend.ps1"
$frontendScript = Join-Path $PSScriptRoot "dev-frontend.ps1"

Write-Host "Запуск REFAI Backend и Frontend..." -ForegroundColor Cyan

Start-Process powershell.exe -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$backendScript`""
Start-Process powershell.exe -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$frontendScript`""

Write-Host "Оба процесса запущены в отдельных окнах:" -ForegroundColor Green
Write-Host "  Backend:  http://127.0.0.1:8000" -ForegroundColor Yellow
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Yellow
