@echo off
rem One-click STOP: kill the game server listening on port 8399
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8399 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
exit
