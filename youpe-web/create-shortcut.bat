@echo off
REM Bam dup file nay de tao shortcut - khoi phai mo PowerShell bang tay
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1"
