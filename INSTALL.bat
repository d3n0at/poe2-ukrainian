@echo off
rem Встановлення українського перекладу Path of Exile 2.
chcp 65001 >nul
if /i "%~1"=="/uninstall" goto uninstall
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
set "RC=%ERRORLEVEL%"
echo.
rem Launchers run this without a console input: pause returns at once there
pause
exit /b %RC%

:uninstall
rem LBK Launcher "Uninstall": the translation lives inside the game bundles, Steam's file check restores them
start "" "steam://validate/2694490"
rem Remove the installer folder only when it sits inside the game folder (how LBK unpacks it)
if not exist "%~dp0..\Bundles2\_.index.bin" exit /b 0
if not exist "%~dp0install.ps1" exit /b 0
cd /d "%~dp0.."
(goto) 2>nul & rd /s /q "%~dp0"
