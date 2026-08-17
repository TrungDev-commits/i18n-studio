@echo off
echo ===================================================
echo   Starting i18n Translation Studio (Desktop)...
echo ===================================================
cd /d %~dp0

if not exist node_modules (
    echo [1/2] Installing dependencies (server & client)...
    call npm install
)

echo [2/2] Launching Desktop App (build + Electron)...
start "i18n-studio" cmd /k "npm run desktop"
echo Started! You can close this window now.