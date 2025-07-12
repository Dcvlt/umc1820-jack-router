@echo off
echo Starting JACK Audio Router Service...

REM Set paths - adjust these to match your actual installation
set JACK_PATH=C:\Program Files\JACK2
set WSL_DISTRO=Ubuntu
set SCRIPT_DIR=%~dp0

REM Start JACK Server first (minimized)
echo Starting JACK Server minimized...
start "JACK Server" /min "%JACK_PATH%\qjackctl\qjackctl.exe" -s

REM Wait for JACK to start
echo Waiting for JACK to initialize...
timeout /t 10 /nobreak > nul

REM Ensure shell script has execute permissions
echo Setting execute permissions on shell script...
wsl -d %WSL_DISTRO% -e bash -c "chmod +x '%SCRIPT_DIR%start_jack_audio.sh'"

REM Start Node.js service in WSL using the shell script
echo Starting Node.js service in WSL...
wsl -d %WSL_DISTRO% -e bash -c "cd '%SCRIPT_DIR%' && ./start_jack_audio.sh start"

echo JACK Audio Router Service started successfully!
echo Both JACK Server and Node.js service are running.
pause