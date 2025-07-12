@echo off
echo Setting up Windows startup for JACK Audio Router...

REM Create startup directory
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

REM Create startup shortcut
echo Creating startup shortcut...
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTUP_DIR%\JACK Audio Router.lnk'); $Shortcut.TargetPath = '%~dp0jack_audio_startup.bat'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.Save()"

echo Startup configured successfully!
echo The JACK Audio Router will now start automatically when Windows boots.
pause