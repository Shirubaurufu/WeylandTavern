@echo off
if not "%OS%"=="Windows_NT" (
    echo This start script only works on Windows.
    echo Use the script for Other systems instead.
    pause
    exit /b
)
cd SillyTavern && call npm install --no-audit --no-fund --loglevel=error --no-progress --omit=dev >nul
cls
echo Welcome to Weyland Tavern's character downloader!
echo:
node character-downloader.js https://mega.nz/folder/J5ARwZRI#2hnLHnLjXXNk3GGve7fjlw
echo:
echo Enjoy your time in Weyland!
echo:
pause
popd