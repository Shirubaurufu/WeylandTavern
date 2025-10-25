@echo off
if not "%OS%"=="Windows_NT" (
    echo This start script only works on Windows.
    echo Use the script for Other systems instead.
    pause
    exit /b
)
cd SillyTavern && call npm install --no-audit --no-fund --loglevel=error --no-progress --omit=dev >nul
cls
node chardl/character-downloader.js
pause
popd