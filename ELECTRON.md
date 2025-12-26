# Electron Desktop Application - TobyAI

This document describes the Electron desktop application version of TobyAI MCP Chatbot.

## Overview

TobyAI now supports two deployment modes:
1. **Web Application** (original): Containerized React + Express app
2. **Desktop Application** (new): Electron-based native desktop app

## Architecture

### Electron Structure
```
electron/
├── src/
│   ├── main.ts          # Electron main process
│   ├── server.ts        # Embedded Express server
│   ├── preload.ts       # Security preload script
│   └── menu.ts          # Application menu
├── assets/
│   ├── icon.png         # Linux icon (512x512)
│   ├── icon.icns        # macOS icon
│   └── icon.ico         # Windows icon
├── dist/
│   ├── main.js          # Compiled main process
│   ├── server.js        # Compiled server wrapper
│   ├── preload.js       # Compiled preload
│   └── renderer/        # Built frontend (from frontend/dist)
├── package.json
├── tsconfig.json
└── electron-builder.json
```

### Key Design Decisions

1. **Embedded Express Server**: Express server runs inside Electron's main process (not spawned)
   - Simpler lifecycle management
   - No port conflicts
   - Better error handling

2. **HTTP Communication**: Frontend connects to embedded server via localhost
   - No IPC bridge needed
   - Reuses existing SSE streaming
   - Minimal code changes

3. **Database Location**: SQLite database stored in OS-specific userData folder
   - Linux: `~/.config/TobyAI/config.db`
   - Windows: `%APPDATA%/TobyAI/config.db`
   - macOS: `~/Library/Application Support/TobyAI/config.db`

4. **APP_SECRET Management**:
   - Development: Uses .env file
   - Production: Auto-generated and stored in userData folder

## Development Setup

### Prerequisites

- Node.js 18+ (Node 22 recommended)
- npm or yarn
- Git

### For WSL Users

**Important**: WSL has path issues with npm workspaces. Use containers instead:

```bash
# Build and run web version in container
./start.sh

# For Electron development on WSL:
# 1. Install dependencies on native Linux or use Windows Terminal
# 2. Or develop web version first, then package on native system
```

### For Native Linux/macOS/Windows

```bash
# Clone repository
git clone <repository-url>
cd electron-toby

# Install dependencies
npm install

# Build backend and frontend
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# Build electron
cd electron && npm run build:electron
```

## Running the Desktop App

### Development Mode

```bash
# From project root
npm run dev

# Or from electron directory
cd electron
npm run dev
```

This will:
1. Build backend TypeScript
2. Build electron TypeScript
3. Launch Electron with DevTools open

### Web Development Mode (Original)

```bash
# Use this for faster frontend/backend development
npm run dev:web

# Equivalent to:
# Terminal 1: npm run dev:backend
# Terminal 2: npm run dev:frontend
```

## Building for Production

### Build All Components

```bash
npm run build
```

This compiles:
- Backend (TypeScript → JavaScript)
- Frontend (React → bundled assets)
- Electron (TypeScript → JavaScript)

### Package Desktop App

```bash
# Package for current platform
npm run package

# Package for specific platforms
npm run package:linux    # AppImage, deb
npm run package:mac      # DMG, zip
npm run package:win      # NSIS installer, portable exe
```

**Note**: Cross-platform packaging requires building on target OS:
- Linux builds: Requires Linux
- macOS builds: Requires macOS with Xcode
- Windows builds: Requires Windows (or Linux with wine)

### Packaged Output

```
electron/release/
├── TobyAI-1.0.0.AppImage        # Linux portable
├── tobyai_1.0.0_amd64.deb       # Debian/Ubuntu
├── TobyAI-1.0.0.dmg             # macOS installer
├── TobyAI-1.0.0-mac.zip         # macOS portable
├── TobyAI Setup 1.0.0.exe       # Windows installer
└── TobyAI 1.0.0.exe             # Windows portable
```

## Creating App Icons

The Electron app requires icons for each platform:

```bash
# Generate all icon formats from a single source
npx electron-icon-builder --input=icon-source.png --output=electron/assets

# Requirements:
# - icon-source.png: 1024x1024 PNG
```

This creates:
- `icon.png` (512x512) for Linux
- `icon.icns` (multiple sizes) for macOS
- `icon.ico` (multiple sizes) for Windows

## Configuration

### Environment Variables (Development)

Create `.env` in project root:

```bash
# Required (32+ characters)
APP_SECRET=your-super-secure-secret-key-minimum-32-chars

# Optional
NODE_ENV=development
```

### Production Configuration

In production, the app:
- Auto-generates `APP_SECRET` on first run
- Stores secret in `userData/app-secret.txt`
- Creates database in `userData/config.db`

## Features

All web app features work in Electron:
- ✅ LLM integration (OpenAI-compatible APIs)
- ✅ MCP stdio servers (child_process spawn)
- ✅ MCP HTTP servers (fetch API)
- ✅ SSE streaming chat
- ✅ Chart visualization (Recharts)
- ✅ Configurable hyperparameters
- ✅ Tool discovery UI
- ✅ Persistent configuration

## Differences from Web App

| Feature | Web App | Desktop App |
|---------|---------|-------------|
| Deployment | Docker/Podman | Native installer |
| Backend | Separate container | Embedded in app |
| Frontend | Separate container | Bundled in app |
| Database | `./data/config.db` | `userData/config.db` |
| Port | Fixed (3000) | Auto-detect available |
| Updates | Docker pull | Manual download |

## Troubleshooting

### Port 3000 Already in Use

The app automatically finds an available port starting from 3000.

### Database Not Found

Check userData path:
```bash
# Linux
~/.config/TobyAI/

# Windows
%APPDATA%\TobyAI\

# macOS
~/Library/Application Support/TobyAI/
```

### MCP Servers Not Found

In packaged app, MCP servers must be:
- Installed globally (e.g., `npm install -g @server/package`)
- Or use full paths in configuration

### Electron Won't Start

```bash
# Rebuild native modules
cd electron
npm run postinstall

# Or manually
npx electron-rebuild -f -w better-sqlite3
```

### better-sqlite3 Issues

This native module requires rebuilding for Electron:

```bash
# Install electron-rebuild
npm install -g @electron/rebuild

# Rebuild
cd electron
electron-rebuild -f -w better-sqlite3
```

## Development Workflow

### Option 1: Electron Development

```bash
npm run dev
```

Best for:
- Testing Electron-specific features
- UI/UX in desktop environment
- Cross-platform compatibility

### Option 2: Web Development

```bash
npm run dev:web
```

Best for:
- Faster iteration (hot reload)
- Backend/frontend development
- No Electron overhead

### Option 3: Container Development

```bash
./start.sh
```

Best for:
- WSL users
- Consistent environment
- CI/CD workflows

## Testing

### Backend Tests

```bash
# Run all tests
npm test --workspace=backend

# Integration tests only
npm run test:integration --workspace=backend

# In containers (recommended for WSL)
podman exec -it mcp-chatbot-backend npm test
```

### Electron Manual Testing

- [ ] App launches successfully
- [ ] Database created in userData folder
- [ ] LLM configuration persists
- [ ] MCP stdio servers spawn
- [ ] Chat streaming works
- [ ] Charts render
- [ ] App closes cleanly (no zombie processes)

## Dual Deployment Strategy

Both deployment modes are maintained:

### For Developers
- Use web mode for rapid development
- Use Electron mode for desktop testing
- Use containers for WSL/CI/CD

### For Users
- **Web deployment**: Self-hosted with Docker
- **Desktop deployment**: Download installer

## Next Steps

### Completed
- ✅ Electron workspace structure
- ✅ Main process implementation
- ✅ Server embedding
- ✅ Backend adaptation
- ✅ Frontend build configuration
- ✅ Package.json updates

### TODO
- [ ] Install dependencies (use native system, not WSL)
- [ ] Build and test Electron app
- [ ] Create app icons
- [ ] Test packaging for all platforms
- [ ] Update README.md
- [ ] Create release workflow

### Future Enhancements
- [ ] Auto-updates (electron-updater)
- [ ] System tray integration
- [ ] Native notifications
- [ ] Global keyboard shortcuts
- [ ] First-run setup wizard
- [ ] macOS menu bar app

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-builder](https://www.electron.build/)
- [MCP Documentation](https://modelcontextprotocol.io)
- [Original Web App Guide](./CLAUDE.md)

## Support

For issues:
1. Check this documentation
2. Review [CLAUDE.md](./CLAUDE.md) for backend/frontend details
3. Open issue on GitHub
