@echo off
setlocal enabledelayedexpansion
title youpe - Build app desktop (Windows)
cd /d "%~dp0"

echo.
echo  ============================================
echo    youpe  -  Build app desktop cho Windows
echo  ============================================
echo.
echo  File nay chi la vo boc. Viec that do "npm run build" lam:
echo    1. Kiem tra Node va thu vien
echo    2. Kiem tra loi kieu TypeScript
echo    3. Tai yt-dlp ban moi nhat
echo    4. Dong bo cau hinh Turso sang cho ban dong goi doc duoc
echo    5. Build ban web roi dong goi thanh file cai dat
echo.
echo  Lan dau mat khoang 5-15 phut tuy toc do mang.
echo.
pause

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [X] Chua cai Node.js. Tai tai https://nodejs.org roi chay lai.
  echo.
  pause & exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo.
echo  Node: !NODEVER!

REM Electron tai tu github, o VN doi khi rat cham - dung mirror cho nhanh.
REM Chi anh huong luc "npm install", da cai roi thi khong dung toi.
if not defined ELECTRON_MIRROR set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

call npm run build
if errorlevel 1 goto :failed

echo.
if exist "%~dp0youpe-desktop\release" start "" "%~dp0youpe-desktop\release"
pause
exit /b 0

:failed
echo.
echo  ============================================
echo    CO LOI - doc thong bao ben tren
echo  ============================================
echo.
echo  Hay gap nhat:
echo    - Loi kieu TypeScript: sua code roi chay lai
echo    - Tai Electron that bai: kiem tra mang, hoac chay tay
echo        set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
echo        npm install --prefix youpe-desktop
echo.
pause
exit /b 1
