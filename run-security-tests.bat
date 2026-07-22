@echo off
setlocal

echo ============================================================
echo   DIGITAL CODE VAULT - SECURITY VERIFICATION DEMO
echo ============================================================
echo.
echo This will run three independent security verification scripts
echo against the live SQLite database to prove security controls.
echo.
echo Press any key to start the demo...
pause >nul

cd /d "%~dp0apps\api"

echo.
echo ============================================================
echo   RUNNER 1: security-test.js (10 tests)
echo ============================================================
node security-test.js
if %errorlevel% neq 0 (
  echo [FAIL] security-test.js exited with errors
  pause
  exit /b %errorlevel%
)

echo.
echo ============================================================
echo   RUNNER 2: security-test2.js (12 tests)
echo ============================================================
node security-test2.js
if %errorlevel% neq 0 (
  echo [FAIL] security-test2.js exited with errors
  pause
  exit /b %errorlevel%
)

echo.
echo ============================================================
echo   RUNNER 3: security-test3.js (12 tests)
echo ============================================================
node security-test3.js
if %errorlevel% neq 0 (
  echo [FAIL] security-test3.js exited with errors
  pause
  exit /b %errorlevel%
)

echo.
echo ============================================================
echo   ALL SECURITY VERIFICATIONS COMPLETED SUCCESSFULLY
echo ============================================================
pause
