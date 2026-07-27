@echo off
title youpe (dev)
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Chua cai Node.js. Tai tai https://nodejs.org
  pause & exit /b 1
)

if not exist "node_modules\" call npm install --no-audit --no-fund
if not exist "bin\yt-dlp.exe" call npm run setup:ytdlp

echo.
echo   Che do phat trien - sua code la tu tai lai.
echo   Dia chi: http://localhost:3000
echo.

start "" /b cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:3000"
call npm run dev
