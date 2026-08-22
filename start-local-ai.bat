@echo off
setlocal
cd /d "%~dp0"

set "MODEL=%~dp0Hy-MT2-1.8B-2Bit_4.gguf"
set "LLAMA=%~dp0llama-server.exe"
set "BRIDGE=%~dp0local-openai-bridge.py"

if not exist "%LLAMA%" (
  echo ERROR: llama-server.exe not found next to this BAT.
  pause
  exit /b 1
)

if not exist "%MODEL%" (
  echo ERROR: Hy-MT2-1.8B-2Bit_4.gguf not found next to this BAT.
  pause
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python is required for the local API bridge.
  pause
  exit /b 1
)

echo Starting llama-server on port 8080...
start "Hy-MT2 llama-server" /min cmd /c ""%LLAMA%" -m "%MODEL%" --host 0.0.0.0 --port 8080 --cors-origins https://app.alibazrgar.ir,http://127.0.0.1:5500,http://localhost:5500 --jinja -ngl 0 -c 2048"

timeout /t 2 /nobreak >nul

echo Starting browser-compatible local bridge on port 8090...
python "%BRIDGE%"
