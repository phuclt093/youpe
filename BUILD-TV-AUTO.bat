@echo off
setlocal enabledelayedexpansion
title youpe - Build app Android TV box (auto, khong dung lai)
cd /d "%~dp0youpe-tv"

echo.
echo  ============================================
echo    youpe  -  Build app cho Android TV box (auto)
echo  ============================================
echo.

REM ---------- 1. Java ----------
if defined JAVA_HOME goto :java_ok

set "STUDIO_JBR=%ProgramFiles%\Android\Android Studio\jbr"
if exist "%STUDIO_JBR%\bin\java.exe" (
  set "JAVA_HOME=%STUDIO_JBR%"
  echo  Dung Java kem theo Android Studio
  goto :java_ok
)

where java >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [X] Khong tim thay Java.
  echo.
  exit /b 1
)

:java_ok

REM ---------- 2. Android SDK ----------
if not exist "local.properties" (
  if defined ANDROID_HOME (
    echo sdk.dir=%ANDROID_HOME:\=\\%> local.properties
  ) else if exist "%LOCALAPPDATA%\Android\Sdk" (
    echo sdk.dir=%LOCALAPPDATA:\=\\%\\Android\\Sdk> local.properties
  ) else (
    echo.
    echo  [X] Khong tim thay Android SDK.
    echo.
    exit /b 1
  )
  echo  Da tao local.properties
)

REM ---------- 3. build ----------
echo.
echo  Dang build ban TV...
echo.
call gradlew.bat :app:assembleRelease > "%~dp0build-tv-log.txt" 2>&1
set "RC=%errorlevel%"

set "OUT=%~dp0youpe-tv\app\build\outputs\apk\release"

if not "%RC%"=="0" (
  echo.
  echo  ============================================
  echo    CO LOI - xem build-tv-log.txt
  echo  ============================================
  echo.
  exit /b 1
)

echo.
echo  ============================================
echo    XONG
echo  ============================================
echo.
echo  File APK nam trong:
echo    %OUT%
echo.

exit /b 0
