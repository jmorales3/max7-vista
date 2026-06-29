@echo off
REM Creates a "Max7 Vista" shortcut on your Desktop that starts the server
REM with a double-click. Run this once after setup.

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..
set SHORTCUT=%USERPROFILE%\Desktop\Max7 Vista.lnk

powershell -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$s = $ws.CreateShortcut('%SHORTCUT%');" ^
  "$s.TargetPath = '%PROJECT_DIR%\scripts\start-server-quick.bat';" ^
  "$s.WorkingDirectory = '%PROJECT_DIR%';" ^
  "$s.WindowStyle = 1;" ^
  "$s.Description = 'Start Max7 Vista LAN Server';" ^
  "$s.Save()"

if exist "%SHORTCUT%" (
    echo.
    echo  Shortcut created on your Desktop: "Max7 Vista"
    echo  Double-click it any time to start the server.
    echo.
) else (
    echo.
    echo  [WARN] Could not create shortcut automatically.
    echo  You can manually create a shortcut to:
    echo  %PROJECT_DIR%\scripts\start-server-quick.bat
    echo.
)
pause
