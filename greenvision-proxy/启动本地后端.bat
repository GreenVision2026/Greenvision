@echo off
cd /d "%~dp0"
echo Starting GreenVision local backend...
echo.
echo Backend: http://localhost:3001
echo Health:  http://localhost:3001/health
echo.
echo Keep this window open while using Greenvision.html locally.
echo Press Ctrl+C to stop the backend.
echo.
npm.cmd start
pause
