@echo off
title Board games launcher
cd /d "C:\ClaudeCode\board-games"

rem already running? just open the browser instead of starting a second server
netstat -ano | findstr /c:"0.0.0.0:8080" /c:"[::]:8080" | findstr /c:"LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo Board games server is already running - opening the browser.
  start "" "http://localhost:8080"
  exit
)

echo Starting board games (LAN server) on http://localhost:8080 ...
echo (close the server window to stop it)
echo The server window also prints the WiFi address other devices use for poker.
start "Board games server" cmd /k "node lan\server.mjs"
rem wait ~3s for the server to bind
rem (ping, not timeout - timeout aborts when stdin is redirected)
ping -n 4 127.0.0.1 >nul
start "" "http://localhost:8080"
exit
