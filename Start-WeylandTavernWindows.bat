@echo off
if not "%OS%"=="Windows_NT" (
    echo This start script only works on Windows.
    echo Use the script for Other systems instead.
    pause
    exit /b
)
title Weyland Tavern

cls
echo.
echo ===========================================================
echo             WELCOME TO WEYLAND TAVERN LAUNCHER
echo ===========================================================
echo.
echo This launcher will start the Weyland Tavern server.
echo !!! Keep this window open while using Weyland Tavern!
echo     Closing this window will shut down the server.
echo.
echo ===========================================================
echo.


REM Check if git is installed
setlocal enabledelayedexpansion
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Git is not installed. Cannot check for updates.
    echo Please manually install git to get the latest updates.
    set /p continue_nogit="Continue without update checking? (Y/N) [Default: Y] "
    if "!continue_nogit!"=="" set continue_nogit=Y
    if /i "!continue_nogit!"=="N" exit /b 0
) else (
    REM Get current branch name
    for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set CURRENT_BRANCH=%%a

    REM Get current version (just the commit hash since we don't use tags)
    for /f "tokens=*" %%a in ('git rev-parse --short HEAD 2^>nul') do set CURRENT_VERSION=%%a
    if "!CURRENT_VERSION!"=="" set CURRENT_VERSION=unknown

    echo Checking for Weyland Tavern updates...
    echo.

    REM Fetch latest from remote
    git fetch >nul 2>&1

    REM Get new version
    for /f "tokens=*" %%a in ('git rev-parse --short origin/!CURRENT_BRANCH! 2^>nul') do set NEW_VERSION=%%a
    if "!NEW_VERSION!"=="" set NEW_VERSION=unknown

    REM Simply compare if they're different
    if "!CURRENT_VERSION!" neq "!NEW_VERSION!" (
        echo Update found!
        echo   Current Version: !CURRENT_VERSION!
        echo   New Version:     !NEW_VERSION!

        echo.
        set /p apply_update="Apply update? (Y/N) [Default: Y] "
        if /i "!apply_update!"=="" set apply_update=Y
        
        if /i "!apply_update!"=="Y" (
            echo.
            echo Applying update...
            git pull > SillyTavern/WTUpdate.log 2>&1
            
            if errorlevel 1 (
                echo.
                echo [!] Update failed - there may be file conflicts.
                echo [!] Generating log file: SillyTavern/WTUpdate.log
                echo.
                git --no-pager diff --compact-summary
                echo.
                set /p do_reset="Reset to latest official version? Your personal files won't be affected. (Y/N) [Default: Y] "
                if "!do_reset!"=="" set do_reset=Y
                
                if /i "!do_reset!"=="Y" (
                    echo.
                    echo Resetting to latest version...
                    
                    REM Abort any stuck merge
                    git merge --abort >nul 2>&1
                    
                    REM Clear any remaining conflicts
                    for /f "tokens=*" %%f in ('git diff --name-only --diff-filter^=U 2^>nul') do (
                        git checkout --theirs "%%f" >nul 2>&1
                        git add "%%f" >nul 2>&1
                    )
                    
                    REM Hard reset to remote - no merge commits left behind
                    git reset --hard origin/!CURRENT_BRANCH! >nul 2>&1
                    
                    if errorlevel 1 (
                        echo [!] Reset failed. Please contact support.
                        echo [!] Log saved to: SillyTavern/WTUpdate.log
                        set /p continue="Continue without update? (Y/N) [Default: N] "
                        if /i "!continue!"=="" set continue=N
                        if /i "!continue!"=="N" exit /b 0
                    ) else (
                        echo Update applied successfully!
                    )
                ) else (
                    set /p continue="Continue without update? (Y/N) [Default: N] "
                    if /i "!continue!"=="" set continue=N
                    if /i "!continue!"=="N" exit /b 0
                )
            ) else (
                echo Update applied successfully!
            )
        ) else (
            echo Proceeding without update...
        )
    ) else (
        echo Weyland Tavern is up to date!
        echo   Current Version: !CURRENT_VERSION!
    )
)
endlocal

echo.
echo -----------------------------------------------------------
echo.

:: Install npm dependencies
pushd %~dp0
if exist "SillyTavern\config.yaml" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Join-Path (Get-Location) 'SillyTavern\config.yaml'; if (Test-Path -LiteralPath $p) { $c = [System.IO.File]::ReadAllText($p); if ($c -match '(?m)^[ \t]*enableCorsProxy:[^\r\n]*') { $c = $c -replace '(?m)^[ \t]*enableCorsProxy:[^\r\n]*', 'enableCorsProxy: true' } else { $c = $c.TrimEnd() + [Environment]::NewLine + 'enableCorsProxy: true' + [Environment]::NewLine }; [System.IO.File]::WriteAllText($p, $c) }"
)
set NODE_ENV=production
cd SillyTavern && call npm install --no-audit --no-fund --loglevel=error --no-progress --omit=dev >nul 2>&1

echo.
echo -----------------------------------------------------------
echo.
echo Starting Weyland Tavern server...
echo A browser window will open automatically when ready.
echo.
echo ===========================================================
echo              WEYLAND TAVERN IS NOW ACTIVE
echo              Server running on: localhost:8000
echo ===========================================================
echo.
echo REMINDER: Keep this window open!
echo.

:: Start the SillyTavern server
start /b node server.js --listen true --listen-host 0.0.0.0 --listen-port 8000 %* >nul 2>&1

echo.
echo Press any key to SHUT DOWN and close Weyland Tavern...
pause >nul

echo.
echo Shutting down Weyland Tavern server...
taskkill /F /FI "WINDOWTITLE eq Weyland Tavern" >nul 2>&1
exit /b 0
