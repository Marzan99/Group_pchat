@echo off
title Paramount Group PChat - Public Cloudflare Tunnel
echo ================================================================
echo   Launching Free Cloudflare Public Tunnel for Paramount Group PChat
echo   Target Local Server: http://localhost:4000
echo   Designed & Developed by Marzan
echo ================================================================
echo.
echo Connecting to Cloudflare edge network...
echo Your secure public HTTPS URL will be displayed below (e.g. https://xxx.trycloudflare.com).
echo Any branch or user across Bangladesh can open that link to chat!
echo.
"%~dp0cloudflared.exe" tunnel --url http://localhost:4000
pause
