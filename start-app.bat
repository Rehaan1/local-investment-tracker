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

echo Waiting for server...
powershell -NoProfile -Command "for ($i=0; $i -lt 40; $i++) { try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1',4000); $c.Close(); exit 0 } catch { Start-Sleep -Milliseconds 500 } } exit 1"

if %errorlevel%==0 (
  echo Opening browser...
  start "" http://127.0.0.1:5173
) else (
  echo Server did not start in time. Open http://127.0.0.1:5173 manually.
)

endlocal
