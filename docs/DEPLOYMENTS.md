# Deployment Guide

## Version Update System

Ketone uses a version checking system that notifies users when a new version is available. The system polls the API every 5 minutes and displays a toast notification when a newer version is detected.

### How It Works

1. **Version Source**: Both API and Web read the version from the root `package.json`
2. **Polling**: The SPA polls `GET /v1/version` every 5 minutes
3. **Detection**: When the server version differs from the client version, a toast appears
4. **User Action**: Users click "Update Now" to reload and get the new version

## Releasing a New Version

### Step 1: Update the Version

Edit `package.json` in the project root:

```json
{
  "name": "ketone",
  "version": "1.1.0",  // Update this
  ...
}
```

Use semantic versioning:
- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features, backward compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes

### Step 2: Commit and Push

```bash
git add package.json
git commit -m "chore: bump version to 1.1.0"
git push origin main
```

### Step 3: Deploy

Deploy both API and Web to ensure version consistency:

```bash
# On your VPS or deployment environment

# Pull latest changes
git pull origin main

# Rebuild and restart API
cd api
bun install
# Restart your API service (systemd, pm2, etc.)

# Rebuild Web
cd ../web
bun install
bun run build
# Deploy the dist/ folder to your web server
```

### Step 4: Verify

1. Check the API returns the new version:
   ```bash
   curl https://api.ketone.dev/v1/version
   # Should return: {"version":"1.1.0","buildTime":"..."}
   ```

2. Users with the old version will see a toast notification within 5 minutes
3. Clicking "Update Now" reloads the page with the new version

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   package.json  │     │   package.json  │
│   (root)        │     │   (root)        │
│   version:1.1.0 │     │   version:1.1.0 │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│      API        │     │      Web        │
│                 │     │  (Vite build)   │
│  GET /v1/version│◄────│                 │
│  → "1.1.0"      │     │  __APP_VERSION__│
└─────────────────┘     │  = "1.1.0"      │
                        └─────────────────┘
```

## Troubleshooting

### Toast always appears in development

Ensure both API and Web are running with the same version. In development, both should read from the same `package.json`.

### Toast doesn't appear after deployment

1. Verify the API is returning the new version
2. Check browser console for polling errors
3. Ensure the Web build was done after updating `package.json`
4. Clear browser cache if testing manually

### Version mismatch after partial deployment

Always deploy both API and Web together. If only one is updated, users may see inconsistent behavior.
