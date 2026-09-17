@echo off
chcp 65001 >nul
if /i "%~1"=="/uninstall" goto uninstall

set "NODE_EXE=%~dp0node\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

rem Proton/Wine (SteamOS, Linux): console output is not visible there and pause never returns
reg query "HKLM\Software\Wine" >nul 2>&1
if not errorlevel 1 goto wine

"%NODE_EXE%" "%~dp0src\install.mjs"
set "RC=%ERRORLEVEL%"
echo.
rem Launchers run this without a console input: pause returns at once there
pause
exit /b %RC%

:wine
"%NODE_EXE%" "%~dp0src\install.mjs" > "%~dp0install.log" 2>&1
set "RC=%ERRORLEVEL%"
type "%~dp0install.log"
exit /b %RC%

:uninstall
start "" "steam://validate/2694490"
if not exist "%~dp0..\Bundles2\_.index.bin" exit /b 0
if not exist "%~dp0src\install.mjs" exit /b 0
cd /d "%~dp0.."
(goto) 2>nul & rd /s /q "%~dp0"
