# Oracle Cloud Always Free Deployment Guide

Deploy your F1 WebGPU backend on Oracle Cloud's **Always Free** tier with 24GB RAM!

## 🎯 Why Oracle Cloud?

- ✅ **24GB RAM** (48x more than Railway!)
- ✅ **4 ARM cores** (Ampere A1)
- ✅ **200GB storage** (persistent!)
- ✅ **Always Free** (no time limit)
- ✅ Fast parallel processing with multiprocessing

---

## Step 1: Create Oracle Cloud Account

1. Go to [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
2. Click **"Start for free"**
3. Fill in your details
   - ⚠️ **Credit card required** (but won't be charged for Always Free tier)
   - Choose your home region (can't change later!)
4. Verify email and complete signup

---

## Step 2: Create a VM Instance

### 2.1 Navigate to Compute Instances
1. Log in to [cloud.oracle.com](https://cloud.oracle.com)
2. Click **☰ Menu** → **Compute** → **Instances**
3. Click **"Create Instance"**

### 2.2 Configure Instance

**Name**: `f1-backend-server`

**Placement**: Leave default (Availability Domain)

**Image and Shape**:
1. Click **"Change Image"**
   - Select: **Ubuntu 22.04** (Minimal or Canonical)
   - Click **"Select Image"**

2. Click **"Change Shape"**
   - Select: **Ampere** (ARM-based processor)
   - Shape: **VM.Standard.A1.Flex**
   - OCPUs: **4** (max for free tier)
   - Memory: **24 GB** (max for free tier)
   - Click **"Select Shape"**

**Networking**:
- Leave default (creates new VCN automatically)
- ✅ "Assign a public IPv4 address" (should be checked)

**SSH Keys**:
- ✅ "Generate SSH key pair" (recommended)
- Click **"Save Private Key"** and **"Save Public Key"**
- Store these safely! You'll need them to access your server

**Boot Volume**: Leave default (50GB is fine, or use up to 200GB if you want)

### 2.3 Create Instance
1. Click **"Create"**
2. Wait 2-3 minutes for provisioning
3. Note down the **Public IP Address** (you'll need this!)

---

## Step 3: Configure Firewall (Security List)

### 3.1 Open Required Ports
1. On your instance page, click the **VCN name** (under "Primary VNIC")
2. Click **"Security Lists"** → Click your security list
3. Click **"Add Ingress Rules"** and add:

**Rule 1 - HTTP**:
- Source CIDR: `0.0.0.0/0`
- IP Protocol: `TCP`
- Destination Port Range: `80`
- Description: `HTTP`

**Rule 2 - HTTPS**:
- Source CIDR: `0.0.0.0/0`
- IP Protocol: `TCP`
- Destination Port Range: `443`
- Description: `HTTPS`

**Rule 3 - Node.js Backend**:
- Source CIDR: `0.0.0.0/0`
- IP Protocol: `TCP`
- Destination Port Range: `3001`
- Description: `F1 Backend API`

4. Click **"Add Ingress Rules"** for each

---

## Step 4: Connect to Your VM

### On Mac/Linux:
```bash
chmod 600 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@YOUR_PUBLIC_IP
```

### On Windows:
Use **PuTTY** or **Windows Terminal** with the private key.

---

## Step 5: Install Dependencies on VM

Once connected via SSH:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io docker-compose
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ubuntu

# Install Git
sudo apt install -y git

# Logout and login again for docker group to take effect
exit
```

Log back in via SSH.

---

## Step 6: Clone and Deploy Your Project

```bash
# Clone your repository
git clone https://github.com/YOUR_USERNAME/f1-webgpu-visualization.git
cd f1-webgpu-visualization

# Build Docker image
docker build -t f1-backend .

# Run the container
docker run -d \
  --name f1-backend \
  --restart unless-stopped \
  -p 3001:3001 \
  -v $(pwd)/data:/app/public/data \
  f1-backend

# Check logs
docker logs -f f1-backend
```

---

## Step 7: Configure Firewall on VM

Oracle VMs also have an internal firewall. Open the ports:

```bash
# Allow port 3001
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
sudo netfilter-persistent save

# Or disable firewall entirely (simpler but less secure)
sudo iptables -F
sudo netfilter-persistent save
```

---

## Step 8: Update Frontend Environment Variables

Update your Vercel environment variables:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `http://YOUR_ORACLE_IP:3001/api` |
| `VITE_WS_URL` | `ws://YOUR_ORACLE_IP:3001` |

Or for production with domain/SSL:
| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-domain.com/api` |
| `VITE_WS_URL` | `wss://your-domain.com` |

Redeploy your Vercel frontend.

---

## Step 9: Enable Multiprocessing Again! 🚀

Now that you have **24GB RAM**, let's restore full parallel processing:

```bash
# SSH into your VM
ssh -i ~/Downloads/ssh-key-*.key ubuntu@YOUR_PUBLIC_IP

# Navigate to project
cd f1-webgpu-visualization

# Pull latest changes
git pull origin main

# Edit the Python file
nano backend/python/lib/f1_data.py
```

Change line ~401:
```python
# FROM:
num_processes = min(2, len(drivers))

# TO:
num_processes = min(8, len(drivers))  # Use 8 workers with 24GB RAM!
```

Save and rebuild:
```bash
docker build -t f1-backend .
docker stop f1-backend
docker rm f1-backend
docker run -d --name f1-backend --restart unless-stopped -p 3001:3001 -v $(pwd)/data:/app/public/data f1-backend
```

---

## Step 10: Test Your Deployment

1. Visit: `http://YOUR_ORACLE_IP:3001/health`
   - Should show: `{"status":"ok"}`

2. Open your Vercel site and try loading race data
   - With 8 workers and 24GB RAM, it should take **~2 minutes**! 🚀

---

## 🎉 Benefits of This Setup

- ✅ **24GB RAM** - No more OOM errors!
- ✅ **8 parallel workers** - Fetch races in 2-3 minutes
- ✅ **Persistent storage** - Data survives restarts
- ✅ **No cold starts** - Always running
- ✅ **100% FREE** - Forever!

---

## Optional: Add Domain + SSL

### Using Cloudflare (Free):
1. Add your domain to Cloudflare
2. Create an A record pointing to Oracle IP
3. Enable "Proxied" for free SSL
4. Update Vercel env vars to use your domain

### Using Let's Encrypt (Free):
```bash
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com
# Configure nginx/caddy as reverse proxy
```

---

## Maintenance

### View logs:
```bash
docker logs -f f1-backend
```

### Restart service:
```bash
docker restart f1-backend
```

### Update code:
```bash
cd f1-webgpu-visualization
git pull origin main
docker build -t f1-backend .
docker restart f1-backend
```

---

## 💰 Cost

**$0.00 forever** with Always Free tier!

Just make sure you selected **Ampere A1 (ARM)** shape and stayed within the free tier limits.

---

Need help? Check Oracle Cloud documentation or reach out!
