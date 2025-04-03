@echo off
if not "%OS%"=="Windows_NT" (
    echo This start script only works on Windows.
    echo Use the script for Other systems instead.
    pause
    exit /b
)
git fetch origin
for /f "tokens=*" %%i in ('git rev-list --count HEAD..origin/release') do set BEHIND=%%i
if %BEHIND% GTR 0 (
    echo Found updates.
    echo Updating WeylandTavern...
    git stash
    git pull origin release -q
    git stash pop
    if errorlevel 1 (
        echo There was an error updating WeylandTavern.
    ) else (
        echo WeylandTavern is now up to date!
    )
)
pushd %~dp0
set NODE_ENV=production
cd SillyTavern && call npm install --no-audit --no-fund --loglevel=error --no-progress --omit=dev
echo Starting WeylandTavern...
echo A browser window will open automatically when ready.
node server.js %* >nul 2>&1
pause
popd
