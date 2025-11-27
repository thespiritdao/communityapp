# Windows CMD Git Commands for SpiritDAO

**Quick reference for Git commands on Windows CMD Prompt**

---

## 💻 For CMD Prompt Users

CMD doesn't support multi-line strings like PowerShell. All git commit messages must be **single line**.

---

## 📝 Common Git Commands

### Check Status
```cmd
git status
```

### Stage All Changes
```cmd
git add .
```

### Commit with Message (Single Line Only)
```cmd
git commit -m "Your commit message here - all on one line"
```

**❌ This WON'T work in CMD:**
```cmd
git commit -m "
First line
Second line
"
```

**✅ This WILL work in CMD:**
```cmd
git commit -m "First line - Second line - Third line"
```

### Push to GitHub
```cmd
git push
```

### Push for First Time (Sets Upstream)
```cmd
git push -u origin main
```

---

## 🔄 Complete Deploy Workflow

### Option A: Use the Batch Script (Recommended)
```cmd
deploy-windows.bat
```

This script does everything automatically:
1. Checks git status
2. Stages changes
3. Creates commit
4. Pushes to GitHub
5. Triggers Vercel deployment

### Option B: Manual Steps
```cmd
REM 1. Check what changed
git status

REM 2. Stage changes
git add .

REM 3. Commit (single line message)
git commit -m "Fix Vercel build error - moved test script for production"

REM 4. Push
git push
```

---

## 🚨 Fixing Common Issues

### Issue: .env Files Were Committed
```cmd
REM Remove from git (but keep locally)
git rm --cached .env
git rm --cached .env.local

REM Commit the removal
git commit -m "Remove environment files from git"

REM Push
git push
```

### Issue: Need to Undo Last Commit (Not Pushed Yet)
```cmd
REM Undo commit but keep changes
git reset --soft HEAD~1

REM Undo commit and discard changes (CAREFUL!)
git reset --hard HEAD~1
```

### Issue: Need to Pull Latest Changes
```cmd
git pull
```

---

## 📊 Viewing History

### View Commit History
```cmd
REM Last 5 commits
git log -5

REM Pretty format
git log --oneline --graph --all -10
```

### View Changes
```cmd
REM See unstaged changes
git diff

REM See staged changes
git diff --cached
```

---

## 🌿 Branching

### Create New Branch
```cmd
git checkout -b feature/my-new-feature
```

### Switch Branches
```cmd
git checkout main
```

### List All Branches
```cmd
git branch -a
```

---

## 🔗 Remote Management

### View Remotes
```cmd
git remote -v
```

### Add Remote (First Time)
```cmd
git remote add origin https://github.com/YOUR_USERNAME/spiritdao.git
```

---

## ⚡ Quick Deploy (CMD Version)

**Create a file named `quick-deploy.bat`:**

```batch
@echo off
set MESSAGE=%1
if "%MESSAGE%"=="" set MESSAGE=Quick update

git add .
git commit -m "%MESSAGE%"
git push

echo.
echo Deployed! Check Vercel dashboard for build status.
pause
```

**Usage:**
```cmd
REM With custom message
quick-deploy.bat "Fix invite modal styling"

REM With default message
quick-deploy.bat
```

---

## 🎯 Right Now - Deploy Your Fix

### Step 1: Run the Deployment Script

```cmd
deploy-windows.bat
```

**OR** do it manually:

```cmd
git add .
git commit -m "Fix Vercel build error - moved test script outside src folder for production deployment"
git push
```

### Step 2: Watch Vercel

1. Go to https://vercel.com/dashboard
2. Click your project
3. See the new deployment start
4. Watch build logs (~2-5 min)

---

## 💡 Tips for CMD Users

1. **Keep commit messages single line** - CMD doesn't handle multi-line well
2. **Use batch scripts for repetitive tasks** - Saves typing
3. **Comments in batch files use `REM`** - Not `#` or `//`
4. **Use quotes for messages with spaces** - `git commit -m "My message"`
5. **Consider using Git Bash** - Comes with Git for Windows, supports all syntax

---

## 🔄 Alternative: Git Bash

If you want PowerShell-style commands, use **Git Bash** instead of CMD:

1. Right-click in your project folder
2. Select **"Git Bash Here"**
3. Now you can use Unix-style commands and multi-line strings

**Git Bash Example:**
```bash
git commit -m "
Fix Vercel build error

- Moved test script outside src folder
- Ready for production deployment
"
```

---

## 🆘 Emergency: Reset to Last Working Version

```cmd
REM See recent commits
git log -5

REM Reset to specific commit (replace COMMIT_HASH)
git reset --hard COMMIT_HASH

REM Force push (CAREFUL!)
git push --force
```

---

## 📞 Need Help?

- **Git Documentation:** https://git-scm.com/doc
- **GitHub Guides:** https://guides.github.com
- **Vercel Docs:** https://vercel.com/docs
