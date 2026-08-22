@echo off
setlocal

set "APP_DIR=%~dp0"
set "SERVER=%APP_DIR%llama-server.exe"
set "MODEL=%APP_DIR%Hy-MT2-1.8B-2Bit_4.gguf"
set "HOST=0.0.0.0"
set "PORT=8080"
set "CTX=2048"

if not exist "%SERVER%" (
  echo ERROR: llama-server.exe was not found next to this BAT file.
  pause
  exit /b 1
)

if not exist "%MODEL%" (
  echo ERROR: Hy-MT2-1.8B-2Bit_4.gguf was not found next to this BAT file.
  pause
  exit /b 1
)

where netsh >nul 2>&1
if %errorlevel%==0 (
  netsh advfirewall firewall add rule name="Hy-MT2 llama-server 8080" dir=in action=allow protocol=TCP localport=%PORT% >nul 2>&1
)

echo.
echo ==============================================
echo        Hy-MT2 1.8B 2-bit API Server
echo ==============================================
echo.
echo Listening on: %HOST%:%PORT%
echo API base:      http://YOUR-LAPTOP-IP:%PORT%/v1
echo Health:        http://YOUR-LAPTOP-IP:%PORT%/health
echo.
echo Press CTRL+C to stop the server.
echo.

"%SERVER%" ^
  -m "%MODEL%" ^
  --host %HOST% ^
  --port %PORT% ^
  --alias Hy-MT2-1.8B-2Bit ^
  --jinja ^
  -ngl 0 ^
  -c %CTX%

pause
