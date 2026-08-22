@echo off
setlocal EnableExtensions

title AI Chat - Local Chrome Mode

set "APP_DIR=%~dp0"
set "MODEL=%APP_DIR%Hy-MT2-1.8B-2Bit_4.gguf"
set "SERVER=%APP_DIR%llama-server.exe"
set "LOCAL_SERVER=%APP_DIR%local-server.py"

if not exist "%SERVER%" (
  echo ERROR: llama-server.exe not found.
  echo Put this BAT beside llama-server.exe.
  pause
  exit /b 1
)

if not exist "%MODEL%" (
  echo ERROR: Hy-MT2-1.8B-2Bit_4.gguf not found.
  echo Put the model beside this BAT.
  pause
  exit /b 1
)

if not exist "%LOCAL_SERVER%" (
  echo ERROR: local-server.py not found.
  echo Download/copy it from the app repository beside this BAT.
  pause
  exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python was not found in PATH.
  pause
  exit /b 1
)

echo.
echo ================================================
echo       Hy-MT2 + AI Chat LOCAL MODE
echo ================================================
echo.
echo Starting llama-server on 127.0.0.1:8080...
echo.

start "Hy-MT2 llama-server" /MIN cmd /c ""%SERVER%" -m "%MODEL%" --host 127.0.0.1 --port 8080 --alias Hy-MT2-1.8B-2Bit --jinja --cors-origins "*" --cors-methods "GET,POST,PUT,DELETE,OPTIONS" --cors-headers "*" -ngl 0 -c 2048 -t 0 -tb 0"

set /a WAIT=0
:WAIT_LLAMA
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/v1/models -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto LLAMA_OK
set /a WAIT+=1
if %WAIT% GEQ 30 (
  echo ERROR: llama-server did not become ready.
  echo Check its window for the actual error.
  pause
  exit /b 1
)
goto WAIT_LLAMA

:LLAMA_OK
echo [OK] llama-server is ready.
echo.
echo Starting local AI Chat server on 127.0.0.1:3000...
echo.

start "AI Chat Local Server" cmd /k python "%LOCAL_SERVER%"

timeout /t 2 /nobreak >nul

echo.
echo ================================================
echo READY
echo ================================================
echo.
echo Open the app in Chrome:
echo   http://127.0.0.1:3000/
echo.
echo Local OpenAI-compatible API:
echo   http://127.0.0.1:3000/v1
 echo.
echo llama-server:
echo   http://127.0.0.1:8080/v1
 echo.
echo Opening Chrome...
echo.

start "" chrome.exe "http://127.0.0.1:3000/"

if errorlevel 1 (
  echo Chrome was not found automatically.
  echo Open manually: http://127.0.0.1:3000/
)

echo.
echo Keep the llama-server and Local Server windows open.
echo Close those windows to stop the local service.
echo.
pause
