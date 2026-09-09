@echo off
rem One-click START: launch game server (minimized) + open browser
cd /d "%~dp0"
netstat -ano | findstr :8399 | findstr LISTENING >nul 2>&1
if %errorlevel%==0 goto open
start "FengZhiYuan-Server" /min python "%~dp0serve.py" 8399
timeout /t 1 /nobreak >nul
:open
start "" "http://127.0.0.1:8399/?t=%RANDOM%%RANDOM%"
exit
