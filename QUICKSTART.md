# Quick Start Guide

## TL;DR - Get Running in 2 Minutes

```bash
# 1. Start everything
./start.sh

# 2. Open browser
http://localhost:5173

# 3. Configure LLM in Settings
# Example: Ollama at http://host.docker.internal:11434/v1

# 4. Start chatting!
```

## What You Get

✅ **Complete web application** running in containers:
- Modern React frontend with TobyAI branding (http://localhost:5173)
- Express REST API backend (http://localhost:3000)
- SQLite database with encrypted credentials
- Real-time streaming chat with SSE
- Automatic chart visualization for data responses
- Intelligent metric selection based on queries
- Health monitoring and status indicators

✅ **No installation required** on your host system:
- Everything runs in Podman containers
- No Node.js needed
- No npm packages in your home directory
- Isolated and reproducible environment

✅ **Production-ready architecture**:
- Hot reload for development
- Separate production builds
- Air-gap deployment capable
- Comprehensive testing suite

## First Time Setup

### 1. Ensure APP_SECRET is Set

The `.env` file should already exist. Verify it has a secure APP_SECRET:

```bash
# Check if .env exists
cat .env | grep APP_SECRET

# It should show something like:
# APP_SECRET=change-this-to-a-secure-random-string-at-least-32-characters-long
```

**Important**: If it still says "change-this", replace it with a secure random string (at least 32 characters).

### 2. Start the Application

```bash
./start.sh
```

This will:
- Build both frontend and backend containers
- Start services in the background
- Create necessary volumes and networks
- Check health status

### 3. Configure Your LLM

Open http://localhost:5173 and click **Settings**.

#### For Ollama (Running on Host):

```
Base URL: http://host.docker.internal:11434/v1
Model: llama2
API Key: (leave empty)
```

**Note**: Use `host.docker.internal` to access services on your host machine from inside containers.

#### For vLLM (Running on Host):

```
Base URL: http://host.docker.internal:8000/v1
Model: mistralai/Mistral-7B-Instruct-v0.2
API Key: (leave empty)
```

#### For OpenAI:

```
Base URL: https://api.openai.com/v1
Model: gpt-4
API Key: sk-...
```

### 4. Test Configuration

Click "Save Configuration" - it will test the connection before saving.

If successful, you'll see: ✅ "LLM configuration saved successfully"

### 5. Start Chatting!

Click "Chat" and send your first message!

### 6. Using Chart Visualization

When you ask for data (e.g., "Show my steps for the last 7 days"):

✅ **The chatbot will:**
- Automatically detect numeric data in tool responses
- Generate beautiful interactive charts using Recharts
- Show only the metrics you asked for
- Provide a concise 2-3 sentence summary

✅ **Smart metric selection:**
- "My heart rate" → shows only heart rate
- "How many steps?" → shows only step count
- "Activity summary" → shows relevant health metrics

✅ **Features:**
- Hover over data points for details
- Automatic date formatting
- Responsive design
- Dark theme optimized

## Daily Usage

### Start Services

```bash
./start.sh
# or
podman-compose up -d
```

### View Logs

```bash
# All services
podman-compose logs -f

# Just backend
podman-compose logs -f backend

# Just frontend
podman-compose logs -f frontend
```

### Stop Services

```bash
./stop.sh
# or
podman-compose down
```

### Restart After Code Changes

```bash
podman-compose restart backend  # Backend changes
podman-compose restart frontend # Frontend changes
```

## Accessing Ollama from Container

If you're running Ollama on your host machine, containers need to access it via `host.docker.internal` (on Podman/Docker Desktop) or your host IP.

### Find Your Host IP

```bash
# Linux
ip addr show | grep "inet " | grep -v 127.0.0.1

# macOS
ipconfig getifaddr en0
```

Then use in LLM config:
```
Base URL: http://192.168.1.100:11434/v1
```

### Or Use host.docker.internal

On Podman, add this to `docker-compose.yml`:

```yaml
services:
  backend:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Then use: `http://host.docker.internal:11434/v1`

## Troubleshooting

### "Cannot reach LLM endpoint"

1. Check if your LLM is running:
   ```bash
   curl http://localhost:11434/v1/models
   ```

2. Use correct URL from container:
   - NOT: `http://localhost:11434/v1`
   - USE: `http://host.docker.internal:11434/v1`

### "Port already in use"

```bash
# Check what's using the port
sudo lsof -i :3000
sudo lsof -i :5173

# Stop services
podman-compose down
```

### "Database is locked"

```bash
# Stop containers
podman-compose down

# Remove lock file
rm backend/data/config.db-journal

# Restart
podman-compose up -d
```

### "Permission denied on /app/data"

```bash
# Fix permissions
chmod 755 backend/data
chown $USER:$USER backend/data
```

### Containers won't start

```bash
# Check container logs
podman-compose logs

# Check container status
podman ps -a

# Rebuild from scratch
podman-compose down -v
podman-compose build --no-cache
podman-compose up -d
```

## Development Workflow

### Edit Backend Code

1. Edit files in `backend/src/`
2. Server restarts automatically (hot reload)
3. Refresh browser

### Edit Frontend Code

1. Edit files in `frontend/src/`
2. Vite HMR updates browser automatically
3. No refresh needed

### Run Tests

```bash
# Backend tests
podman exec -it mcp-chatbot-backend npm test

# Integration tests
podman exec -it mcp-chatbot-backend npm run test:integration
```

### Access Database

```bash
# From host
sqlite3 backend/data/config.db

# From container
podman exec -it mcp-chatbot-backend sh
sqlite3 /app/data/config.db
```

### Add npm Packages

```bash
# Backend
cd backend
echo "package-name" >> package.json  # Edit package.json
podman-compose build backend
podman-compose up -d backend

# Frontend
cd frontend
echo "package-name" >> package.json  # Edit package.json
podman-compose build frontend
podman-compose up -d frontend
```

## Production Deployment

### Build Production Images

```bash
podman-compose -f docker-compose.prod.yml build
```

### Start Production

```bash
podman-compose -f docker-compose.prod.yml up -d
```

Production runs on:
- Frontend: http://localhost (port 80)
- Backend: http://localhost:3000

### Export for Air-Gap

```bash
# Save images
podman save -o mcp-backend.tar localhost/mcp-chatbot-backend
podman save -o mcp-frontend.tar localhost/mcp-chatbot-frontend

# Transfer to air-gap system
scp *.tar user@airgap:/tmp/

# Load on air-gap
podman load -i /tmp/mcp-backend.tar
podman load -i /tmp/mcp-frontend.tar
```

## What's Next?

Current phase: **Phase 1 Complete** ✅
- ✅ Basic chat with configurable LLM
- ✅ Streaming responses
- ✅ Configuration management
- ✅ Health monitoring

Coming in Phase 2:
- 🚧 MCP stdio server support
- 🚧 Tool execution in chat
- 🚧 Multiple MCP servers

Coming in Phase 3:
- 🚧 MCP HTTP/SSE servers
- 🚧 Tool discovery
- 🚧 Advanced error handling

## Need Help?

- **Documentation**: See [README.md](README.md) and [PODMAN.md](PODMAN.md)
- **Logs**: `podman-compose logs -f`
- **Health**: http://localhost:3000/api/health
- **Container status**: `podman ps`

## Clean Uninstall

```bash
# Stop and remove everything
podman-compose down -v

# Remove images
podman rmi mcp-chatbot-backend mcp-chatbot-frontend

# Remove data
rm -rf backend/data
```

---

**Enjoy your MCP-enabled chatbot!** 🚀
