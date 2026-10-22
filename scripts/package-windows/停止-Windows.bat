@echo off
setlocal
for %%I in ("%~dp0.") do set "YUNTU_DIR=%%~fI"
cd /d "%YUNTU_DIR%"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%YUNTU_DIR%\stop-windows.ps1"
if errorlevel 1 (
  echo Failed to stop YunTu. Check the error message above.
  set /p "YUNTU_CLOSE=Press Enter to close this window..."
  exit /b 1
)
echo YunTu stopped.
set /p "YUNTU_CLOSE=Press Enter to close this window..."
exit /b 0
