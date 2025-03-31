@echo off
if not "%OS%"=="Windows_NT" (
    echo This start script only works on Windows.
    echo Use the script for Other systems instead.
    pause
    exit /b
)
echo ======================================================
echo                 WEYLAND TAVERN UPDATER
echo ======================================================
echo.
echo Welcome to the Weyland Tavern update wizard!
echo WeylandTavern will now attempt to update itself.
echo.
git stash
git pull origin release -q
git stash pop
if errorlevel 1 (
    echo There was an error updating WeylandTavern.
) else (
    echo WeylandTavern is up to date!
)
pause
popd
