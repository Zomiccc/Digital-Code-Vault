@echo off
setlocal

echo Killing processes on ports 3000, 5173, 5174, 5175...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do taskkill /PID %%a /F 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /PID %%a /F 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174') do taskkill /PID %%a /F 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5175') do taskkill /PID %%a /F 2>nul

echo Starting API on port 3000...
start "API" cmd /k "cd /d "%~dp0apps\api" && npm run start:dev"

echo Starting Admin on port 5173...
start "Admin" cmd /k "cd /d "%~dp0apps\admin" && npm run dev"

echo Starting Merchant on port 5174...
start "Merchant" cmd /k "cd /d "%~dp0apps\merchant" && npm run dev"

echo Starting Portal on port 5175...
start "Portal" cmd /k "cd /d "%~dp0apps\portal" && npm run dev"

echo.
echo =========================================
echo   All servers starting!
echo   API:      http://localhost:3000/api/v1
echo   Admin:    http://localhost:5173
echo   Merchant: http://localhost:5174
echo   Portal:   http://localhost:5175
echo =========================================
echo.
echo Admin login: admin@digitalcode.local / Admin123!@#
echo Merchant login: merchant@test.com / Merchant123!@#
