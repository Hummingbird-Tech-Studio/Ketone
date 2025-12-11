# OVH VPS Setup Guide for Ketone API

This guide documents the complete process to configure an OVH VPS for deploying the Ketone API.

## Server Information

- **Provider**: OVH
- **Operating System**: Ubuntu
- **IP**: 51.79.67.180
- **API Domain**: api.ketone.dev
- **Database**: Neon PostgreSQL (external)

---

## Step 1: Configure DNS

Add an A record in your DNS provider for the API subdomain:

| Type | Name | Value        |
| ---- | ---- | ------------ |
| A    | api  | 51.79.67.180 |

This creates the subdomain `api.ketone.dev` pointing to the VPS.

**Verify propagation**: https://dnschecker.org searching for `api.ketone.dev`

---

## Step 2: Connect to VPS via SSH

OVH sends credentials via email when the VPS is created.

```bash
ssh root@51.79.67.180
```

### Troubleshooting SSH Connection

**Error: Permission denied with root user**

On some OVH VPS with Ubuntu, the `root` user is disabled for SSH. Use the `ubuntu` user instead:

```bash
ssh ubuntu@51.79.67.180
```

> **Note**: With the `ubuntu` user, use `sudo` for commands requiring root privileges.

**SSH connection diagnostics**:

```bash
ssh -v ubuntu@51.79.67.180
```

**Exit SSH session**:

```bash
exit
```

Or press `Ctrl+D`.

---

## Step 3: Initial Server Configuration

### Update the system

```bash
sudo apt update && sudo apt upgrade -y
```

### Install dependencies

```bash
sudo apt install -y nginx certbot python3-certbot-nginx git ufw unzip
```

> **Note**: `unzip` is required to install Bun.

---

## Step 4: Install Bun

### Standard installation

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

### Troubleshooting Bun Installation

**Error: "unzip is required to install bun"**

```bash
sudo apt install -y unzip
```

Then retry the Bun installation.

**Error: "Segmentation fault" / "Illegal instruction" when running Bun**

This error occurs on VPS with older CPUs (like Haswell). The standard Bun version uses CPU instructions that are not available.

**Solution 1**: Install baseline version of Bun:

```bash
curl -fsSL https://bun.sh/install | BUN_INSTALL_BASELINE=1 bash
source ~/.bashrc
```

**Solution 2**: If baseline doesn't work, install an older version:

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.1.0"
source ~/.bashrc
bun --version
```

**Check server CPU**:

```bash
cat /proc/cpuinfo | grep -m1 "model name"
```

In our case: `Intel Core Processor (Haswell, no TSX)` - required Bun v1.1.0.

---

## Step 5: Configure Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Type `y` when asked to continue.

---

## Step 6: Clone the Repository

### Create directory and assign permissions

```bash
sudo mkdir -p /var/www
sudo chown ubuntu:ubuntu /var/www
cd /var/www
```

### Configure Deploy Key (for private repositories)

**Generate SSH key**:

```bash
ssh-keygen -t ed25519 -C "ketone-vps" -f ~/.ssh/github_deploy -N ""
```

**Display public key**:

```bash
cat ~/.ssh/github_deploy.pub
```

**Add to GitHub**:

1. Go to the repository on GitHub
2. Settings → Deploy keys → Add deploy key
3. Title: `OVH VPS`
4. Paste the public key
5. Do NOT check "Allow write access"
6. Click "Add key"

**Configure SSH to use the key**:

```bash
echo 'Host github.com
  IdentityFile ~/.ssh/github_deploy' >> ~/.ssh/config
```

### Clone the repository

```bash
cd /var/www
git clone git@github.com:andresperezc/ketone.git
```

Type `yes` when asked about host authenticity.

---

## Step 7: Install Project Dependencies

```bash
cd /var/www/ketone
bun install
```

---

## Step 8: Configure Environment Variables

Create environment file at the project root:

```bash
nano /var/www/ketone/.env.local
```

Content:

```env
DATABASE_URL='postgresql://[user]:[password]@[host]/[database]?sslmode=require'
JWT_SECRET='[your_secure_secret]'
API_BASE_URL="https://api.ketone.dev"
RESEND_API_KEY="[your_api_key]"
FRONTEND_URL="https://ketone.dev"
FROM_EMAIL="no-reply@ketone.dev"
SKIP_TLS_VERIFY=false
```

Save: `Ctrl+X`, `Y`, `Enter`

---

## Step 9: Test the API Manually

```bash
cd /var/www/ketone/api
bun run --env-file=../.env.local src/index.ts
```

Should display:

```
🔌 Connecting to Neon PostgreSQL with @effect/sql-pg...
🚀 Starting Effect HTTP Server...
Listening on http://localhost:3000
```

Stop with `Ctrl+C`.

---

## Step 10: Create systemd Service

Create service file:

```bash
sudo nano /etc/systemd/system/ketone-api.service
```

Content:

```ini
[Unit]
Description=Ketone API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/var/www/ketone/api
ExecStart=/home/ubuntu/.bun/bin/bun run --env-file=../.env.local src/index.ts
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Save: `Ctrl+X`, `Y`, `Enter`

### Enable the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable ketone-api
sudo systemctl start ketone-api
sudo systemctl status ketone-api
```

Status should show `active (running)`.

---

## Step 11: Configure Nginx as Reverse Proxy

Create site configuration:

```bash
sudo nano /etc/nginx/sites-available/api.ketone.dev
```

Content:

```nginx
server {
    listen 80;
    server_name api.ketone.dev;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Save: `Ctrl+X`, `Y`, `Enter`

### Enable the site

```bash
sudo ln -s /etc/nginx/sites-available/api.ketone.dev /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 12: Configure SSL with Let's Encrypt

```bash
sudo certbot --nginx -d api.ketone.dev
```

Follow the prompts:

1. Enter email
2. Accept terms of service (`Y`)
3. Optionally share email with EFF (`N`)

Certbot will automatically configure HTTPS and HTTP to HTTPS redirection.

---

## Verifying the Server is Running

### Check API Service Status

```bash
sudo systemctl status ketone-api
```

Expected output should show:

```
● ketone-api.service - Ketone API
     Loaded: loaded (/etc/systemd/system/ketone-api.service; enabled; ...)
     Active: active (running) since ...
```

### Check if the API Process is Running

```bash
ps aux | grep bun
```

Should show a process like:

```
ubuntu   12345  ... /home/ubuntu/.bun/bin/bun run --env-file=../.env.local src/index.ts
```

### Check if Port 3000 is Listening

```bash
sudo ss -tlnp | grep 3000
```

Expected output:

```
LISTEN  0  511  127.0.0.1:3000  0.0.0.0:*  users:(("bun",pid=12345,fd=...))
```

### Check Nginx Status

```bash
sudo systemctl status nginx
```

### Test API Locally (from VPS)

```bash
curl http://localhost:3000/api/auth
```

Should return a response (404 is normal for this route, it means the server is responding).

### Test API Externally (with HTTPS)

```bash
curl -v https://api.ketone.dev/api/auth
```

Should show:

- SSL certificate information
- HTTP response code (404 is expected for `/api/auth`)

### Check SSL Certificate

```bash
curl -vI https://api.ketone.dev 2>&1 | grep -A 5 "Server certificate"
```

### View Real-time API Logs

```bash
sudo journalctl -u ketone-api -f
```

### View Last 100 Lines of API Logs

```bash
sudo journalctl -u ketone-api -n 100
```

### Check for Errors in Logs

```bash
sudo journalctl -u ketone-api --since "1 hour ago" | grep -i error
```

---

## Common Commands

### Service Management

```bash
# Start the API
sudo systemctl start ketone-api

# Stop the API
sudo systemctl stop ketone-api

# Restart the API
sudo systemctl restart ketone-api

# Check service status
sudo systemctl status ketone-api

# Enable service on boot
sudo systemctl enable ketone-api

# Disable service on boot
sudo systemctl disable ketone-api
```

### Logs

```bash
# View real-time logs
sudo journalctl -u ketone-api -f

# View last N lines
sudo journalctl -u ketone-api -n 50

# View logs since specific time
sudo journalctl -u ketone-api --since "2024-01-01 00:00:00"

# View logs from last hour
sudo journalctl -u ketone-api --since "1 hour ago"
```

### Nginx

```bash
# Test configuration
sudo nginx -t

# Reload configuration
sudo systemctl reload nginx

# Restart Nginx
sudo systemctl restart nginx

# View Nginx error logs
sudo tail -f /var/log/nginx/error.log

# View Nginx access logs
sudo tail -f /var/log/nginx/access.log
```

### Deployment

```bash
# Deploy new version
cd /var/www/ketone && git pull && bun install && sudo systemctl restart ketone-api

# Check deployment was successful
sudo systemctl status ketone-api
curl -I https://api.ketone.dev
```

### SSL Certificate

```bash
# Check certificate expiration
sudo certbot certificates

# Renew certificates (automatic, but manual if needed)
sudo certbot renew

# Test renewal process
sudo certbot renew --dry-run
```

### Bun

```bash
# Update Bun to latest version (requires stopping the service)
sudo systemctl stop ketone-api
bun upgrade
sudo systemctl start ketone-api

# Verify service is running
sudo systemctl status ketone-api
```

Expected output after upgrade:

```
● ketone-api.service - Ketone API
     Active: active (running) ← Service is running correctly
```

---

## Troubleshooting

### API Won't Start

1. Check logs for errors:

   ```bash
   sudo journalctl -u ketone-api -n 50
   ```

2. Try running manually to see errors:

   ```bash
   cd /var/www/ketone/api
   bun run --env-file=../.env.local src/index.ts
   ```

3. Verify environment file exists:
   ```bash
   cat /var/www/ketone/.env.local
   ```

### 502 Bad Gateway

1. Check if API is running:

   ```bash
   sudo systemctl status ketone-api
   ```

2. Check if port 3000 is listening:

   ```bash
   sudo ss -tlnp | grep 3000
   ```

3. Restart both services:
   ```bash
   sudo systemctl restart ketone-api
   sudo systemctl restart nginx
   ```

### SSL Certificate Issues

1. Check certificate status:

   ```bash
   sudo certbot certificates
   ```

2. Renew if expired:
   ```bash
   sudo certbot renew
   ```

### Database Connection Issues

1. Check logs for database errors:

   ```bash
   sudo journalctl -u ketone-api | grep -i "database\|postgres\|neon"
   ```

2. Verify DATABASE_URL in environment:
   ```bash
   grep DATABASE_URL /var/www/ketone/.env.local
   ```

---

## File Structure on Server

```
/var/www/ketone/
├── .env.local              # Environment variables
├── api/
│   └── src/
│       └── index.ts        # API entry point
├── web/                    # Frontend (not deployed on VPS)
└── shared/                 # Shared code

/etc/systemd/system/
└── ketone-api.service      # systemd service

/etc/nginx/sites-available/
└── api.ketone.dev          # Nginx configuration

/home/ubuntu/.ssh/
├── github_deploy           # Private key for GitHub
├── github_deploy.pub       # Public key for GitHub
└── config                  # SSH configuration
```

---

## Port Summary

| Port | Service       | Access                             |
| ---- | ------------- | ---------------------------------- |
| 22   | SSH           | Public (UFW)                       |
| 80   | HTTP (Nginx)  | Public (UFW) → redirects to 443    |
| 443  | HTTPS (Nginx) | Public (UFW)                       |
| 3000 | API (Bun)     | Localhost only (proxied via Nginx) |
