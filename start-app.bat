@echo off
setlocal

cd /d %~dp0

echo Starting Investment Atlas...

echo Installing root deps...
call npm install

if exist server (
  echo Installing server deps...
  call npm install --prefix server
)

if exist client (
  echo Installing client deps...
  call npm install --prefix client
)

echo Launching dev servers...
start "Investment Atlas" cmd /k "npm run dev"

echo Opening browser...
start "" http://localhost:5173

endlocal
