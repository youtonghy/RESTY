@echo off
echo ================================
echo RESTY - Eye Care Reminder
echo ================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [1/2] Installing dependencies...
    call pnpm install
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install dependencies.
        echo Please make sure pnpm is installed.
        echo.
        echo Install pnpm: npm install -g pnpm
        pause
        exit /b 1
    )
) else (
    echo [1/2] Dependencies already installed
)

echo.
echo [2/2] Starting development server...
echo.
echo Server will start on an available port
echo (usually http://127.0.0.1:3000/ or similar)
echo.
echo The URL will be displayed below:
echo Press Ctrl+C to stop the server
echo ================================
echo.

call pnpm run dev
