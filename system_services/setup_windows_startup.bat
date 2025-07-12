@echo off
echo Setting up Windows startup for JACK Audio Router...

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

REM Create startup shortcut
echo Creating startup shortcut...
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTUP_DIR%\JACK Audio Router.lnk'); $Shortcut.TargetPath = '%SCRIPT_DIR%jack_audio_startup.bat'; $Shortcut.WorkingDirectory = '%SCRIPT_DIR%'; $Shortcut.Save()"

echo Startup configured successfully!
echo The JACK Audio Router will now start automatically when Windows boots.
echo Shortcut created in: %STARTUP_DIR%
pause