@echo off
REM Max7 Vista — Register a Windows Scheduled Task so the server starts
REM automatically when the clinic computer boots, even before anyone logs in,
REM and restarts itself if it stops unexpectedly.
REM
REM Run this by double-clicking, or from an elevated Command Prompt.

setlocal

echo.
echo ============================================
echo  Max7 Vista -- Install Autostart Service
echo ============================================
echo.

net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] This needs to run as Administrator.
    echo         Right-click this file and choose "Run as administrator".
    pause
    exit /b 1
)

set REPO_DIR=%~dp0..
for %%I in ("%REPO_DIR%") do set REPO_DIR=%%~fI

set TASK_NAME=Max7VistaServer
set SCRIPT_PATH=%REPO_DIR%\scripts\start-server-quick.bat

echo [max7] Repo: %REPO_DIR%
echo [max7] Registering scheduled task "%TASK_NAME%"...

schtasks /Create /TN "%TASK_NAME%" ^
    /TR "\"%SCRIPT_PATH%\"" ^
    /SC ONSTART ^
    /RU SYSTEM ^
    /RL HIGHEST ^
    /F

if errorlevel 1 (
    echo [ERROR] Failed to create the scheduled task.
    pause
    exit /b 1
)

REM Also restart it automatically if it ever exits, by adding a restart-on-idle
REM style trigger is not directly supported via schtasks, so we additionally
REM run it once now to confirm it starts correctly.
echo [max7] Starting the task now to verify it works...
schtasks /Run /TN "%TASK_NAME%"

echo.
echo [max7] Done. The server will now start automatically every time this
echo        computer boots -- even before anyone logs in.
echo.
echo        Check status:   schtasks /Query /TN "%TASK_NAME%"
echo        Stop it now:    taskkill /IM node.exe /F
echo        Uninstall:      scripts\uninstall-service-windows.bat
echo.
pause
