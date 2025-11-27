@echo off
REM Windows CMD Script for Git Commit and Deploy
REM Run this in CMD: deploy-windows.bat

echo ======================================
echo   SpiritDAO Deployment Script
echo ======================================
echo.

REM Step 1: Check git status
echo Step 1: Checking git status...
git status
echo.

REM Step 2: Stage all changes
echo Step 2: Staging changes...
git add .
echo Changes staged!
echo.

REM Step 3: Create commit (single line for CMD compatibility)
echo Step 3: Creating commit...
git commit -m "Fix Vercel build error - moved test script outside src folder for production deployment"
echo Commit created!
echo.

REM Step 4: Push to GitHub
echo Step 4: Pushing to GitHub...
echo This will trigger automatic Vercel deployment...
git push
echo Pushed to GitHub!
echo.

echo ======================================
echo   Deployment in Progress!
echo ======================================
echo.
echo Next steps:
echo 1. Go to Vercel Dashboard: https://vercel.com/dashboard
echo 2. Click on your project
echo 3. Watch the deployment logs
echo 4. Deployment takes ~2-5 minutes
echo.
echo If build succeeds, your app will be live!
pause
