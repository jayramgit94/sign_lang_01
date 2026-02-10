@echo off
REM Quick Start Script for Zoom Clone - Windows

echo.
echo ========================================
echo   ZOOM CLONE - Quick Start Setup
echo ========================================
echo.

REM Check if backend folder exists
if not exist "backend" (
    echo ERROR: backend folder not found!
    exit /b 1
)

REM Check if frontend folder exists
if not exist "frontend" (
    echo ERROR: frontend folder not found!
    exit /b 1
)

echo [1/4] Installing Backend Dependencies...
cd backend
if not exist ".env" (
    echo Creating .env from template...
    copy .env.example .env
    echo.
    echo *** IMPORTANT: Edit backend\.env with your MongoDB credentials ***
    echo    1. Go to https://www.mongodb.com/cloud/atlas
    echo    2. Create a cluster
    echo    3. Copy MongoDB URI
    echo    4. Paste it in MONGODB_URI field
    echo.
    pause
)

call npm install
if errorlevel 1 (
    echo ERROR: Failed to install backend dependencies!
    exit /b 1
)

echo.
echo [2/4] Backend setup complete!
echo.

cd ..

echo [3/4] Installing Frontend Dependencies...
cd frontend
if not exist ".env.local" (
    echo Creating .env.local...
    copy .env.example .env.local
)

call npm install
if errorlevel 1 (
    echo ERROR: Failed to install frontend dependencies!
    exit /b 1
)

echo.
echo [4/4] Setup Complete! 
echo.
echo ========================================
echo   NEXT STEPS
echo ========================================
echo.
echo Terminal 1 - Start Backend:
echo   cd backend
echo   npm run dev
echo.
echo Terminal 2 - Start Frontend:
echo   cd frontend
echo   npm run dev
echo.
echo Then open: http://localhost:8000
echo.
echo For deployment instructions, see SETUP.md
echo.
pause
