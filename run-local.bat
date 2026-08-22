@echo off
setlocal EnableExtensions

title AI Chat - Local Chrome Mode

set "APP_DIR=%~dp0"
set "MODEL=%APP_DIR%Hy-MT2-1.8B-2Bit_4.gguf"
set "SERVER=%APP_DIR%llama-server.exe"
set "LOCAL_APP=%APP_DIR%ai-chat-local"
set "LOCAL_SERVER=%LOCAL_APP%\local-server.py"
set "ZIP=%TEMP%\ai-chat-local.zip"

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

where python >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python was not found in PATH.
  echo Install Python 3 and make sure python.exe is in PATH.
  pause
  exit /b 1
)

REM ============================================================
REM Get a local copy of the AI Chat web app.
REM This is done only on the first run. Delete ai-chat-local to
REM force a fresh copy later.
REM ============================================================

if not exist "%LOCAL_APP%\index.html" (
  echo.
  echo Downloading AI Chat for local Chrome mode...
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://github.com/ali-bazrgar/app/archive/refs/heads/main.zip' -OutFile '%ZIP%'"
  if errorlevel 1 (
    echo ERROR: Could not download the app repository.
    pause
    exit /b 1
  )

  if exist "%LOCAL_APP%" rmdir /s /q "%LOCAL_APP%"
  mkdir "%LOCAL_APP%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%TEMP%\ai-chat-extract' -Force"
  if errorlevel 1 (
    echo ERROR: Could not extract the app.
    pause
    exit /b 1
  )
  xcopy /E /I /Y "%TEMP%\ai-chat-extract\app-main\*" "%LOCAL_APP%\" >nul
  rmdir /s /q "%TEMP%\ai-chat-extract" >nul 2>&1
  del /q "%ZIP%" >nul 2>&1
)

if not exist "%LOCAL_SERVER%" (
  echo ERROR: local-server.py is missing from the local app copy.
  pause
  exit /b 1
)

echo.
echo ========================================================
echo          Hy-MT2 + AI Chat - LOCAL CHROME MODE
echo ========================================================
echo.
echo App:          http://127.0.0.1:3000/
echo OpenAI API:   http://127.0.0.1:3000/v1
echo llama-server: http://127.0.0.1:8080/v1
echo.
echo Starting llama-server...
echo.

start "Hy-MT2 llama-server" /MIN cmd /c ""%SERVER%" -m "%MODEL%" --host 127.0.0.1 --port 8080 --alias Hy-MT2-1.8B-2Bit --jinja --cors-origins "*" --cors-methods "GET,POST,PUT,DELETE,OPTIONS" --cors-headers "*" -ngl 0 -c 2048 -t 0 -tb 0"

set /a WAIT=0
:WAIT_LLAMA
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/v1/models -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto LLAMA_OK
set /a WAIT+=1
if %WAIT% GEQ 30 (
  echo.
  echo ERROR: llama-server did not become ready within 30 seconds.
  echo Check the llama-server window.
  pause
  exit /b 1
)
goto WAIT_LLAMA

:LLAMA_OK
echo [OK] llama-server is ready.
echo.
echo Starting local AI Chat server...
echo.

start "AI Chat Local Server" /MIN cmd /c "cd /d "%LOCAL_APP%" && python "%LOCAL_SERVER%""

timeout /t 2 /nobreak >nul

echo.
echo ========================================================
echo READY
 echo ========================================================
echo.
echo OpenAI-compatible Base URL:
echo   http://127.0.0.1:3000/v1
echo.
echo App:
echo   http://127.0.0.1:3000/
echo.
echo Opening Chrome...
echo.

start "" chrome.exe "http://127.0.0.1:3000/"

if errorlevel 1 (
  echo Chrome was not found automatically.
  echo Open manually: http://127.0.0.1:3000/
)

echo.
echo Keep this launcher and the two server processes running.
echo Close them when you are finished.
echo.
pause
