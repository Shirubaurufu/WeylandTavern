@echo off
pushd %~dp0
set NODE_ENV=production
call npm install --no-audit --no-fund --loglevel=error --no-progress --omit=dev
node server.js %* >nul 2>&1
pause
popd
