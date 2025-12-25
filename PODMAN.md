# Running with Podman/Docker

This guide shows you how to run the MCP Chatbot using Podman (or Docker) containers, so you don't need to install Node.js dependencies on your host system.

## Prerequisites

### Option 1: Podman (Recommended)

```bash
# Fedora/RHEL/CentOS
sudo dnf install podman podman-compose

# Ubuntu/Debian
sudo apt install podman podman-compose

# Arch Linux
sudo pacman -S podman podman-compose
```

### Option 2: Docker

```bash
# Install Docker Engine
# Follow instructions at https://docs.docker.com/engine/install/

# Install Docker Compose
sudo apt install docker-compose  # or use docker compose plugin
```

## Quick Start (Development)

### 1. Configure Environment

```bash
# Copy environment file
cp .env.example .env

# Edit and set APP_SECRET (must be at least 32 characters)
nano .env
```

**Important:** Change `APP_SECRET` to a secure random string!

### 2. Start with Podman

```bash
# Build and start all services
podman-compose up --build

# Or run in background
podman-compose up -d --build
```

### 2. Alternative: Start with Docker

```bash
# Build and start all services
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

### 3. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/api/health

### 4. View Logs

```bash
# Podman
podman-compose logs -f

# Docker
docker-compose logs -f

# View specific service
podman-compose logs -f backend
podman-compose logs -f frontend
```

### 5. Stop Services

```bash
# Podman
podman-compose down

# Docker
docker-compose down

# Remove volumes (deletes database)
podman-compose down -v
```

## Production Deployment

### Build Production Images

```bash
# Podman
podman-compose -f docker-compose.prod.yml build

# Docker
docker-compose -f docker-compose.prod.yml build
```

### Start Production Services

```bash
# Podman
podman-compose -f docker-compose.prod.yml up -d

# Docker
docker-compose -f docker-compose.prod.yml up -d
```

### Production URLs

- **Application**: http://localhost (port 80)
- **API**: http://localhost:3000

## Container Architecture

```
┌─────────────────────────────────────────┐
│  Host System (no Node.js needed!)      │
├─────────────────────────────────────────┤
│                                         │
│  ┌────────────────┐  ┌───────────────┐ │
│  │   Frontend     │  │   Backend     │ │
│  │   Container    │  │   Container   │ │
│  │                │  │               │ │
│  │ Node 22 Alpine │  │ Node 22       │ │
│  │ Vite Dev       │  │ Express       │ │
│  │ Port 5173      │  │ Port 3000     │ │
│  └────────────────┘  └───────────────┘ │
│         │                    │          │
│         └────────┬───────────┘          │
│                  │                      │
│          ┌───────▼────────┐             │
│          │  mcp-network   │             │
│          │   (bridge)     │             │
│          └────────────────┘             │
│                                         │
│  Volume: ./backend/data → Container     │
└─────────────────────────────────────────┘
```

## Development Workflow

### Hot Reload

Both frontend and backend have hot reload enabled:

- **Backend**: Edit files in `backend/src/` - server restarts automatically
- **Frontend**: Edit files in `frontend/src/` - Vite HMR updates browser

### Run Commands in Container

```bash
# Backend container
podman exec -it mcp-chatbot-backend sh
npm test

# Frontend container
podman exec -it mcp-chatbot-frontend sh
npm run build
```

### Database Access

The SQLite database is stored in `./backend/data/config.db` on your host system.

```bash
# Access from host
sqlite3 backend/data/config.db

# Or from container
podman exec -it mcp-chatbot-backend sh
sqlite3 /app/data/config.db
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3000 or 5173
sudo lsof -i :3000
sudo lsof -i :5173

# Stop the container using that port
podman stop mcp-chatbot-backend
```

### Permission Denied on data/ Directory

```bash
# Fix permissions (Podman runs rootless)
chmod 755 backend/data
```

### Cannot Connect to Backend from Frontend

Make sure both containers are on the same network:

```bash
# Check network
podman network ls
podman network inspect mcp-network
```

### Container Build Fails

```bash
# Clean build cache
podman system prune -a

# Rebuild without cache
podman-compose build --no-cache
```

### Database Locked Error

If you get "database is locked" errors:

```bash
# Stop all containers
podman-compose down

# Remove lock file
rm backend/data/config.db-journal

# Restart
podman-compose up
```

## Air-Gap Deployment with Podman

### 1. Save Images

```bash
# Build production images
podman-compose -f docker-compose.prod.yml build

# Save to tar files
podman save -o mcp-backend.tar localhost/mcp-chatbot-backend:latest
podman save -o mcp-frontend.tar localhost/mcp-chatbot-frontend:latest
```

### 2. Transfer to Air-Gap System

```bash
# Copy tar files
scp mcp-backend.tar mcp-frontend.tar user@airgap-system:/tmp/

# Also copy compose file and env
scp docker-compose.prod.yml .env user@airgap-system:/opt/mcp-chatbot/
```

### 3. Load on Air-Gap System

```bash
# Load images
podman load -i /tmp/mcp-backend.tar
podman load -i /tmp/mcp-frontend.tar

# Start services
cd /opt/mcp-chatbot
podman-compose -f docker-compose.prod.yml up -d
```

## Rootless Podman Benefits

Podman runs containers **without root privileges**, which is more secure:

- No daemon running as root
- Containers run as your user
- Better security isolation
- Compatible with SELinux

## Systemd Integration (Podman Only)

Generate systemd unit files for auto-start:

```bash
# Generate service files
cd ~/.config/systemd/user
podman generate systemd --new --files --name mcp-chatbot-backend
podman generate systemd --new --files --name mcp-chatbot-frontend

# Enable services
systemctl --user enable container-mcp-chatbot-backend.service
systemctl --user enable container-mcp-chatbot-frontend.service

# Start on boot
loginctl enable-linger $USER
```

## Advanced Configuration

### Custom Network

```yaml
networks:
  mcp-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

### Resource Limits

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '0.50'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

### Environment Variables from File

```bash
# Create .env.local
echo "APP_SECRET=my-super-secret-key" > .env.local

# Use in compose
podman-compose --env-file .env.local up
```

## Performance Tips

1. **Use volumes for persistent data** - Faster than bind mounts
2. **Use .dockerignore** - Reduces build context size
3. **Multi-stage builds** - Smaller production images
4. **Layer caching** - Order Dockerfile commands by change frequency

## Comparison: Podman vs Docker

| Feature | Podman | Docker |
|---------|--------|--------|
| Daemon | No (daemonless) | Yes |
| Root required | No (rootless) | Yes (usually) |
| Systemd integration | Native | Via docker.service |
| OCI compatible | Yes | Yes |
| docker-compose support | Via podman-compose | Native |
| Kubernetes YAML | Yes (podman play kube) | No |

## Next Steps

- Configure LLM endpoint in Settings (http://localhost:5173)
- Add MCP servers for extended functionality
- Connect to local Ollama/vLLM instance

## Support

If you encounter issues:

1. Check logs: `podman-compose logs`
2. Verify network: `podman network inspect mcp-network`
3. Check containers: `podman ps -a`
4. Review documentation: https://docs.podman.io
