# Windows Git Commands for SpiritDAO

**Quick reference for Git commands on Windows PowerShell**

---

## 🪟 Always Use PowerShell (Not CMD)

Windows CMD doesn't support heredoc syntax or multi-line strings properly. Always use **PowerShell** for these commands.

---

## 📝 Common Git Commands

### Check Status
```powershell
git status
```

### Stage All Changes
```powershell
git add .
```

### Commit with Message (Single Line)
```powershell
git commit -m "Your commit message here"
```

### Commit with Multi-Line Message (PowerShell Format)
```powershell
git commit -m @"
First line of commit message

Additional details here
More details

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
"@
```

**Note:** The `@"` and `"@` syntax is PowerShell's heredoc format

### Push to GitHub
```powershell
git push
```

### Push for First Time (Sets Upstream)
```powershell
git push -u origin main
```

---

## 🔄 Complete Deploy Workflow

### Option A: Use the Script (Recommended)
```powershell
.\deploy-windows.ps1
```

This script does everything automatically:
1. Checks git status
2. Stages changes
3. Creates commit
4. Pushes to GitHub
5. Triggers Vercel deployment

### Option B: Manual Steps
```powershell
# 1. Check what changed
git status

# 2. Stage changes
git add .

# 3. Commit
git commit -m @"
Your commit description

Details about what changed

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
"@

# 4. Push
git push
```

---

## 🚨 Fixing Common Issues

### Issue: .env Files Were Committed
```powershell
# Remove from git (but keep locally)
git rm --cached .env
git rm --cached .env.local

# Commit the removal
git commit -m "Remove environment files from git"

# Push
git push
```

### Issue: Need to Undo Last Commit (Not Pushed Yet)
```powershell
# Undo commit but keep changes
git reset --soft HEAD~1

# Undo commit and discard changes (CAREFUL!)
git reset --hard HEAD~1
```

### Issue: Need to Pull Latest Changes
```powershell
# Pull from GitHub
git pull
```

### Issue: Merge Conflicts
```powershell
# Check which files have conflicts
git status

# After resolving conflicts in files:
git add .
git commit -m "Resolve merge conflicts"
git push
```

---

## 📊 Viewing History

### View Commit History
```powershell
# Last 5 commits
git log -5

# Pretty format
git log --oneline --graph --all -10
```

### View Changes
```powershell
# See unstaged changes
git diff

# See staged changes
git diff --cached

# See changes in specific file
git diff path/to/file.ts
```

---

## 🌿 Branching

### Create New Branch
```powershell
git checkout -b feature/my-new-feature
```

### Switch Branches
```powershell
git checkout main
git checkout feature/my-new-feature
```

### List All Branches
```powershell
git branch -a
```

---

## 🔗 Remote Management

### View Remotes
```powershell
git remote -v
```

### Add Remote (First Time)
```powershell
git remote add origin https://github.com/YOUR_USERNAME/spiritdao.git
```

### Change Remote URL
```powershell
git remote set-url origin https://github.com/YOUR_USERNAME/spiritdao.git
```

---

## ⚡ Quick Deploy Script

Save this as `quick-deploy.ps1`:

```powershell
param(
    [string]$message = "Quick update"
)

git add .
git commit -m @"
$message

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
"@
git push

Write-Host "✅ Deployed! Check Vercel dashboard for build status." -ForegroundColor Green
```

**Usage:**
```powershell
# With custom message
.\quick-deploy.ps1 -message "Fix invite modal styling"

# With default message
.\quick-deploy.ps1
```

---

## 🎯 Vercel Auto-Deploy

**Every time you push to GitHub, Vercel automatically:**
1. Detects the push
2. Runs `npm run build`
3. Deploys to production
4. Updates your live URL

**Monitor deployments:**
1. Go to https://vercel.com/dashboard
2. Click your project
3. See "Deployments" tab
4. Watch build logs in real-time

---

## 💡 Tips

1. **Always commit before big changes** - Easy to revert if needed
2. **Use descriptive commit messages** - Helps track what changed
3. **Check git status first** - Know what you're committing
4. **Pull before push** - Avoid conflicts
5. **Don't commit .env files** - Keep secrets secret!

---

## 🆘 Emergency: Reset to Last Working Version

```powershell
# See recent commits
git log -5

# Reset to specific commit (replace COMMIT_HASH with actual hash)
git reset --hard COMMIT_HASH

# Force push (CAREFUL - overwrites remote)
git push --force
```

**⚠️ Only use `--force` if you know what you're doing!**

---

## 📞 Need Help?

- **Git Documentation:** https://git-scm.com/doc
- **GitHub Guides:** https://guides.github.com
- **Vercel Docs:** https://vercel.com/docs
- **Check logs:** Vercel Dashboard → Your Project → Deployments → View Function Logs
