# Deployment Guide

## Version System

API and Web have **independent versions** and can be deployed separately.

| Component | Version Source | Purpose |
|-----------|---------------|---------|
| Web | `web/package.json` + `web/public/version.json` | Toast notifications |
| API | `api/package.json` | Health checks, debugging |

## How Web Version Checking Works

```
┌─────────────────────────────────────────────────────────┐
│                     CLOUDFLARE                          │
│  ┌─────────────┐    ┌─────────────┐                    │
│  │  index.html │    │ version.json│ ← Only changes     │
│  │  (v1.0.0)   │    │ {"v":"1.0.0"}│   when web deploys │
│  └─────────────┘    └──────┬──────┘                    │
└────────────────────────────┼────────────────────────────┘
                             │
                    fetch("/version.json")
                             │
                             ▼
                    ┌─────────────────┐
                    │   SPA (v0.9.0)  │
                    │  "Update toast" │
                    └─────────────────┘
```

1. **Build time**: Version from `web/package.json` is baked into the app
2. **Runtime**: SPA polls `/version.json` every 5 minutes
3. **Detection**: If `version.json` differs from baked version, toast appears
4. **User action**: Click "Update Now" to reload with new version

## Deploying Web Only

```bash
# 1. Update version in both files (must match!)
cd web

# Option A: Use npm version (updates package.json only)
npm version patch --no-git-tag-version
# Then manually update public/version.json to match

# Option B: Manual update
# Edit web/package.json: "version": "1.1.0"
# Edit web/public/version.json: {"version": "1.1.0"}

# 2. Commit and push
git add web/package.json web/public/version.json
git commit -m "chore(web): bump version to 1.1.0"
git push origin main

# 3. Cloudflare auto-deploys from main branch
# API is not affected
```

## Deploying API Only

```bash
# 1. Update version (optional, for tracking)
cd api
npm version patch --no-git-tag-version

# 2. Commit and push
git add api/package.json
git commit -m "chore(api): bump version to 1.1.0"
git push origin main

# 3. Deploy to VPS
ssh your-vps
cd /var/www/ketone
git pull origin main
sudo systemctl restart ketone-api

# Web is not affected, no toast will appear
```

## Deploying Both

Deploy each independently, in any order:

```bash
# Update both versions
npm version patch --no-git-tag-version --prefix web
npm version patch --no-git-tag-version --prefix api
# Update web/public/version.json to match web/package.json

git add .
git commit -m "chore: bump web and api versions"
git push origin main

# API: Deploy to VPS
ssh your-vps
cd /var/www/ketone && git pull && sudo systemctl restart ketone-api

# Web: Cloudflare auto-deploys
```

## Verifying Deployments

### Check API version:
```bash
curl https://api.ketone.dev/v1/version
# {"version":"1.1.0","buildTime":"..."}
```

### Check Web version:
```bash
curl https://www.ketone.dev/version.json
# {"version":"1.1.0"}
```

## Important Notes

- **web/package.json** and **web/public/version.json** must always have the same version
- API version changes do NOT trigger web update toasts
- Web version changes only show toasts after Cloudflare deploys the new `version.json`
