# Windows PowerShell Script for Git Commit and Deploy
# Run this in PowerShell: .\deploy-windows.ps1

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  SpiritDAO Deployment Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check git status
Write-Host "Step 1: Checking git status..." -ForegroundColor Yellow
git status
Write-Host ""

# Step 2: Stage all changes
Write-Host "Step 2: Staging changes..." -ForegroundColor Yellow
git add .
Write-Host "✅ Changes staged" -ForegroundColor Green
Write-Host ""

# Step 3: Create commit
Write-Host "Step 3: Creating commit..." -ForegroundColor Yellow
git commit -m @"
Fix Vercel build error - Production ready

- Moved test script outside src/ folder to prevent build errors
- Fixed module import syntax compatibility
- Ready for Vercel deployment

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
"@
Write-Host "✅ Commit created" -ForegroundColor Green
Write-Host ""

# Step 4: Push to GitHub
Write-Host "Step 4: Pushing to GitHub..." -ForegroundColor Yellow
Write-Host "This will trigger automatic Vercel deployment..." -ForegroundColor Cyan
git push
Write-Host "✅ Pushed to GitHub!" -ForegroundColor Green
Write-Host ""

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Deployment in Progress!" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Go to Vercel Dashboard: https://vercel.com/dashboard" -ForegroundColor White
Write-Host "2. Click on your project" -ForegroundColor White
Write-Host "3. Watch the deployment logs" -ForegroundColor White
Write-Host "4. Deployment takes ~2-5 minutes" -ForegroundColor White
Write-Host ""
Write-Host "If build succeeds, your app will be live! 🎉" -ForegroundColor Green
