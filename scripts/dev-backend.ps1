# ============================================================
#  Refai - Backend (FastAPI / uvicorn, port 8000)
#  Запуск генератора работ. Прокси нужен для Anthropic API.
# ============================================================

try { $Host.UI.RawUI.WindowTitle = "REFAI - Backend (uvicorn :8000)" } catch { }

Set-Location -LiteralPath (Join-Path $PSScriptRoot "..\backend")

# Прокси для доступа к api.anthropic.com (SOCKS5 прокси)
if (-not $env:HTTPS_PROXY) {
    $env:HTTPS_PROXY = "socks5://o750667p1:6paKgpfpNvyU@82.27.99.245:11000"
}
if (-not $env:ALL_PROXY) {
    $env:ALL_PROXY   = "socks5://o750667p1:6paKgpfpNvyU@82.27.99.245:11000"
}

# UTF-8 для логов (иначе UnicodeEncodeError на кириллице)
$env:PYTHONIOENCODING = "utf-8"

Write-Host ""
Write-Host "  REFAI Backend" -ForegroundColor Cyan
Write-Host "  http://127.0.0.1:8000" -ForegroundColor Yellow
Write-Host "  Proxy: $env:HTTPS_PROXY" -ForegroundColor DarkGray
Write-Host ""

& venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000

Write-Host ""
Write-Host "  Backend остановлен. Нажмите Enter для выхода..." -ForegroundColor Red
Read-Host | Out-Null
