@echo off
echo ================================
echo RESTY - Full Build
echo ================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo Installing dependencies...
    call pnpm install
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo.
echo Building frontend...
call pnpm build

if errorlevel 1 (
    echo.
    echo ERROR: Frontend build failed.
    pause
    exit /b 1
)

echo.
echo ================================
echo Build completed successfully!
echo Output: dist/
echo ================================
echo.
pause
