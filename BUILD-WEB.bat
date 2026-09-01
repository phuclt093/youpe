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

REM ---------- yt-dlp: luon lay ban moi nhat ----------
REM Truoc day cho nay chi tai khi bin\yt-dlp.exe chua ton tai, nen sau lan dau
REM la khong bao gio cap nhat nua. YouTube doi cach phat video lien tuc: ban cu
REM vai tuan thuong mat sach luong adaptive (video ket 360p, menu chat luong
REM trong tron), hoac tra ve URL bi googlevideo tu choi 403.
if "%YOUPE_SKIP_YTDLP%"=="1" (
  echo   Bo qua cap nhat yt-dlp ^(YOUPE_SKIP_YTDLP=1^)
) else (
  echo   Cap nhat yt-dlp ve ban moi nhat...
  call npm run update:ytdlp
  if errorlevel 1 echo   [!] Tai khong duoc - van build tiep bang ban dang co trong bin\
)

if not exist "bin\yt-dlp.exe" (
  echo.
  echo   [X] Chua co yt-dlp trong bin\. Kiem tra mang roi chay lai.
  pause
  exit /b 1
)

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
