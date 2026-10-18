@echo off
rem MEK Sales Hub - double-click to start Docker, the database, n8n and the app. The browser opens when it is ready.
rem Keep this window open while you use the app; closing it stops the app.
title MEK Sales Hub
set "APP=%~dp0app"
cd /d "%APP%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%APP%\start.ps1" %*
if errorlevel 1 pause
