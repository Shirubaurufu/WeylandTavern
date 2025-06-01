@echo off
if not "%OS%"=="Windows_NT" (
    echo This start script only works on Windows.
    echo Use the script for Other systems instead.
    pause
    exit /b
)
setlocal enabledelayedexpansion
title WeylandTavern

echo Attempting to update WeylandTavern...
:update
git pull > SillyTavern/WTUpdate.log 2>&1
if errorlevel 1 (
    echo There was an error updating WeylandTavern...
    echo Generating log file SillyTavern/WTUpdate.log...
    git diff --compact-summary > SillyTavern/WTUpdate.log
    git diff --compact-summary
    set /p overwrite="Overwrite incorrect file changes and re-attempt update? (Y/N) [Default: N] "
    if /i "!overwrite!"=="Y" git stash
    if /i "!overwrite!"=="Y" GOTO update
    echo Please provide the WTUpdate log file to the WeylandTavern dev team at your convenience.
    set /p continue="Weyland Tavern failed to update. Start anyway? (Y/N) [Default: N] "
    if /i "!continue!"=="" set "continue=N"
    if /i "!continue!"=="N" exit /b 0
) else (
    echo WeylandTavern is up to date!
)

if /i "!overwrite!"=="Y" (
    set /p pop="Revert differing files post update? (Y/N) [Default: N] "
    if /i "!pop!"=="Y" (
        git stash pop
    ) else (
        git stash clear
    )
)

pushd %~dp0
set NODE_ENV=production
cd SillyTavern && call npm install --no-audit --no-fund --loglevel=error --no-progress --omit=dev >nul
echo Checking for character updates...
node character-downloader.js https://mega.nz/folder/J5ARwZRI#2hnLHnLjXXNk3GGve7fjlw -u
echo Starting WeylandTavern...
echo A browser window will open automatically when ready.
start /b node server.js %* >nul 2>&1
echo WeylandTavern is now active on localhost:8000 (By default)
echo Press any key to exit.
pause >nul
exit /b 0