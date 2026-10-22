@echo off
setlocal
for %%I in ("%~dp0.") do set "YUNTU_DIR=%%~fI"
cd /d "%YUNTU_DIR%"
if not exist logs mkdir logs
if not exist database\data\mysql goto missing_database
if not exist runtime\java\bin\java.exe goto missing_runtime
if not exist runtime\mariadb\bin\mariadbd.exe goto missing_runtime

echo [1/2] Starting built-in database...
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%YUNTU_DIR%\start-windows.ps1" database
if errorlevel 1 goto database_failed
echo [2/2] Starting YunTu...
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%YUNTU_DIR%\start-windows.ps1" application
if errorlevel 1 goto start_failed
echo.
echo YunTu started successfully.
echo Open http://127.0.0.1:8194 in your browser.
echo The service will keep running after this window closes.
set /p "YUNTU_CLOSE=Press Enter to close this window..."
exit /b 0

:missing_runtime
echo Runtime is missing. Extract the complete package first.
set /p "YUNTU_CLOSE=Press Enter to close this window..."
exit /b 1
:missing_database
echo Database data is missing. Keep the database folder when upgrading.
set /p "YUNTU_CLOSE=Press Enter to close this window..."
exit /b 1
:database_failed
echo Database could not start. Check logs\database.log and the error above.
set /p "YUNTU_CLOSE=Press Enter to close this window..."
exit /b 1
:start_failed
echo YunTu could not start. Check logs\case-server-error.log and the error above.
set /p "YUNTU_CLOSE=Press Enter to close this window..."
exit /b 1
