@echo off
setlocal enabledelayedexpansion
title youpe
cd /d "%~dp0"

echo.
echo   youpe - dang khoi dong...
echo.

REM ---- 1. Kiem tra Node ----
where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Chua cai Node.js.
  echo       Tai tai https://nodejs.org roi chay lai file nay.
  echo.
  pause
  exit /b 1
)

REM ---- 2. Cai thu vien neu chua co ----
if not exist "node_modules\" (
  echo   [1/4] Cai thu vien lan dau, mat vai phut...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
) else (
  echo   [1/4] Thu vien da san sang
)

REM ---- 3. Tai yt-dlp neu chua co ----
if not exist "bin\yt-dlp.exe" (
  echo   [2/4] Tai yt-dlp...
  call npm run setup:ytdlp
  if errorlevel 1 goto :failed
) else (
  echo   [2/4] yt-dlp da san sang
)

REM ---- 4. Build neu chua co hoac ma nguon moi hon ----
if not exist ".next\BUILD_ID" (
  echo   [3/4] Build lan dau, mat vai phut...
  call npm run build
  if errorlevel 1 goto :failed
) else (
  echo   [3/4] Ban build da san sang
)

REM ---- 5. Chay server va mo trinh duyet ----
echo   [4/4] Khoi dong server...
echo.
echo   Dia chi: http://localhost:3000
echo   Dong cua so nay de tat server.
echo.

REM doi 4 giay roi mo trinh duyet, de server kip len
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"

call npm run start
goto :eof

:failed
echo.
echo   [X] Co loi xay ra. Doc thong bao ben tren de biet chi tiet.
echo.
pause
exit /b 1
