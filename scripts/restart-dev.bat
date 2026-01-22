@echo off
echo Stopping any running dev servers...
taskkill /F /IM node.exe 2>nul

echo.
echo Clearing Next.js cache...
if exist ".next" (
    rmdir /s /q ".next"
    echo Cache cleared.
) else (
    echo No cache to clear.
)

echo.
echo Starting dev server...
npm run dev
