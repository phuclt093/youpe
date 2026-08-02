@echo off
setlocal enabledelayedexpansion
title youpe - Build app Android dien thoai
cd /d "%~dp0youpe-tv"

echo.
echo  ============================================
echo    youpe  -  Build app cho dien thoai Android
echo  ============================================
echo.
echo  Lan dau Gradle phai tai thu vien, mat khoang 5-15 phut.
echo  Nhung lan sau chi con vai chuc giay.
echo.
pause

REM ---------- 1. Java ----------
REM AGP 8.7 va Gradle 8.12 doi JDK 17 tro len. Android Studio co kem JBR nen
REM neu may da cai Studio thi dung luon, khoi bat nguoi dung cai them JDK.
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
  echo      Cach nhanh nhat: cai Android Studio, no co san JDK ben trong.
  echo      Hoac cai rieng JDK 17: https://adoptium.net
  echo.
  pause & exit /b 1
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
    echo      Cai Android Studio mot lan roi chay lai file nay,
    echo      hoac tu tao file youpe-tv\local.properties voi noi dung:
    echo        sdk.dir=D:\\duong\\dan\\toi\\Android\\Sdk
    echo.
    pause & exit /b 1
  )
  echo  Da tao local.properties
)

REM ---------- 3. build ----------
echo.
echo  Dang build ban dien thoai...
echo.
call gradlew.bat :mobile:assembleRelease
if errorlevel 1 goto :failed

set "OUT=%~dp0youpe-tv\mobile\build\outputs\apk\release"

echo.
echo  ============================================
echo    XONG
echo  ============================================
echo.
echo  File APK nam trong:
echo    %OUT%
echo.
echo  Cai len dien thoai:
echo    Cach 1: chep file APK sang dien thoai (Zalo, USB, Google Drive...)
echo            roi mo file do, cho phep cai tu nguon khong xac dinh.
echo.
echo    Cach 2: cam cap USB, bat Go loi USB tren dien thoai roi chay:
echo         adb install -r "%OUT%\mobile-release.apk"
echo.

if exist "%OUT%" start "" "%OUT%"
pause
exit /b 0

:failed
echo.
echo  ============================================
echo    CO LOI - doc thong bao ben tren
echo  ============================================
echo.
echo  Loi hay gap:
echo    - "SDK location not found"  ^>  chua co Android SDK, xem muc 2 ben tren
echo    - "Unsupported class file"  ^>  Java qua cu, can JDK 17
echo    - "Could not resolve"       ^>  mang chan, thu lai hoac doi mang
echo.
pause
exit /b 1
