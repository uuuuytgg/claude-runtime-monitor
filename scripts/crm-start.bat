@echo off
chcp 65001 >nul 2>&1

echo.
echo === Claude Runtime Monitor - Double-click Start ===
echo.

PowerShell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0crm-start.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Script failed, error code: %ERRORLEVEL%
    pause
)

exit /b %ERRORLEVEL%
