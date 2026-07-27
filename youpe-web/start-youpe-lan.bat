@echo off
title youpe (LAN - cho TV box va dien thoai)
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Chua cai Node.js. Tai tai https://nodejs.org
  pause & exit /b 1
)

if not exist "node_modules\" call npm install --no-audit --no-fund
if not exist "bin\yt-dlp.exe" call npm run setup:ytdlp
if not exist ".next\BUILD_ID" call npm run build

echo.
echo   Server nghe tren moi dia chi - TV box va dien thoai cung mang deu vao duoc.
echo.
echo   Dia chi IP cua may nay:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo      http://%%a:3000
echo.
echo   Neu TV box khong vao duoc, mo cong 3000 tren tuong lua Windows.
echo.

start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"
call npx next start -H 0.0.0.0 -p 3000
