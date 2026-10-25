@echo off
title Paramount Group PChat Server
cd /d "%~dp0"
echo ====================================================
echo   Starting Paramount Group PChat Server...
echo   Local URL: http://localhost:4000
echo   Designed & Developed by Marzan
echo ====================================================
echo.
echo Opening browser automatically...
start "" http://localhost:4000
node server.js
pause
