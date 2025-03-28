@echo off
if not "%OS%"=="Windows_NT" (
    echo This start script only works on Windows.
	echo Use the script for Other systems instead.
	pause
    exit /b
)
pushd %~dp0
set NODE_ENV=production
cd SillyTavern && call npm install --no-audit --no-fund --loglevel=error --no-progress --omit=dev
echo Starting WeylandTavern...
echo A browser window will open automatically when ready.
node server.js %* >nul 2>&1
pause
popd
