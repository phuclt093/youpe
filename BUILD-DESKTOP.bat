@echo off
setlocal enabledelayedexpansion
title youpe - Build app desktop
cd /d "%~dp0"

echo.
echo  ============================================
echo    youpe  -  Build app desktop
echo  ============================================
echo.
echo  Se lam lan luot:
echo    1. Cai thu vien cho youpe-web
echo    2. Tai yt-dlp de goi kem vao app
echo    3. Build ban web (standalone)
echo    4. Cai thu vien cho youpe-desktop
echo    5. Dong goi thanh file cai dat
echo.
echo  Lan dau mat khoang 5-15 phut tuy toc do mang.
echo.
pause

REM ---------- kiem tra Node ----------
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [X] Chua cai Node.js. Tai tai https://nodejs.org roi chay lai.
  echo.
  pause & exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo  Node: !NODEVER!
echo.

REM ---------- 1. thu vien cho web ----------
echo  [1/5] Thu vien cho youpe-web...
cd /d "%~dp0youpe-web"
if not exist "node_modules\" (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
) else (
  echo        da co, bo qua
)

REM ---------- 2. yt-dlp ----------
echo.
echo  [2/5] yt-dlp...
if not exist "bin\yt-dlp.exe" (
  call npm run setup:ytdlp
  if errorlevel 1 goto :failed
) else (
  echo        da co, bo qua
)

REM ---------- 3. thu vien cho desktop ----------
echo.
echo  [3/5] Thu vien cho youpe-desktop...
cd /d "%~dp0youpe-desktop"
if not exist "node_modules\" (
  REM Electron tai tu github, o VN doi khi rat cham - dung mirror npmmirror cho nhanh
  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  [!] Cai that bai. Neu loi khi tai Electron, thu chay tay:
    echo      set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    echo      npm install
    goto :failed
  )
) else (
  echo        da co, bo qua
)

REM ---------- 4. build web + gom file ----------
echo.
echo  [4/5] Build ban web va gom vao resources...
call npm run prepare:web
if errorlevel 1 goto :failed

REM ---------- 5. dong goi ----------
echo.
echo  [5/5] Dong goi thanh file cai dat...
call npx electron-builder --win
if errorlevel 1 goto :failed

echo.
echo  ============================================
echo    XONG
echo  ============================================
echo.
echo  File cai dat nam trong:
echo    %~dp0youpe-desktop\release
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
pause
exit /b 1
