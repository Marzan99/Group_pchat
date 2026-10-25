@echo off
title Paramount Group PChat Server
echo ====================================================
echo   Starting Paramount Group PChat Server...
echo   URL: http://localhost:4000
echo   Designed & Developed by Marzan
echo ====================================================
cd /d "%~dp0"
node server.js
pause
