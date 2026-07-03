@echo off
REM Max7 Vista — Remove the autostart scheduled task installed by
REM setup-service-windows.bat.

net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] This needs to run as Administrator.
    echo         Right-click this file and choose "Run as administrator".
    pause
    exit /b 1
)

schtasks /Delete /TN "Max7VistaServer" /F
if errorlevel 1 (
    echo [max7] No autostart task found -- nothing to remove.
) else (
    echo [max7] Autostart task removed. The server will no longer start automatically on boot.
)
pause
