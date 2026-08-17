@echo off
echo ===================================================
echo   Starting i18n Translation Studio Dashboard...
echo ===================================================
cd /d %~dp0

if not exist server\node_modules (
    echo [1/3] Installing server dependencies...
    cd server && call npm install && cd ..
)

if not exist client\node_modules (
    echo [2/3] Installing client dependencies...
    cd client && call npm install && cd ..
)

echo [3/3] Launching Server & Client...
start cmd /k "cd server && node server.js"
start cmd /k "cd client && npm run dev"

timeout /t 3 >nul
start http://localhost:3000
echo Started! You can close this window now.
