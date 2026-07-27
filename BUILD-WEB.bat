@echo off
title youpe - Build ban web
cd /d "%~dp0youpe-web"

echo.
echo   Build ban web production...
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Chua cai Node.js. Tai tai https://nodejs.org
  pause & exit /b 1
)

if not exist "node_modules\" call npm install --no-audit --no-fund
if not exist "bin\yt-dlp.exe" call npm run setup:ytdlp

call npm run build
if errorlevel 1 (
  echo.
  echo   [X] Build that bai.
  pause & exit /b 1
)

echo.
echo   Xong. Chay bang shortcut "youpe" hoac lenh: npm start
echo.
pause
