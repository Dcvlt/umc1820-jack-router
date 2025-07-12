@echo off
echo Starting JACK Audio Router Service...

REM Set paths
set JACK_PATH=C:\Program Files\JACK2
set WSL_DISTRO=Ubuntu

REM Start JACK Server first (minimized)
echo Starting JACK Server minimized...
start "JACK Server" /min "%JACK_PATH%\qjackctl\qjackctl.exe" -s

REM Wait for JACK to start
echo Waiting for JACK to initialize...
timeout /t 10 /nobreak > nul

REM Start Node.js service in WSL using jackctl
echo Starting Node.js service in WSL...
wsl -d %WSL_DISTRO% -e /usr/local/bin/jackctl start

echo JACK Audio Router Service started successfully!
echo Both JACK Server and Node.js service are running.
pause