# ============================================================
#  Refai - Frontend (Next.js dev-сервер, порт 3000)
#  Сайт: http://localhost:3000
# ============================================================

try { $Host.UI.RawUI.WindowTitle = "REFAI - Frontend (next dev :3000)" } catch { }

Set-Location -LiteralPath (Join-Path $PSScriptRoot "..\frontend")

Write-Host ""
Write-Host "  REFAI Frontend" -ForegroundColor Cyan
Write-Host "  http://localhost:3000" -ForegroundColor Yellow
Write-Host ""

npm run dev

Write-Host ""
Write-Host "  Frontend остановлен. Нажмите Enter для выхода..." -ForegroundColor Red
Read-Host | Out-Null
