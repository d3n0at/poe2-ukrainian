@echo off
rem Встановлення українського перекладу Path of Exile 2.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
