# CLAUDE.md - MCP-Enabled Chatbot

This file provides context for Claude Code instances working on this repository.

## Project Overview

**MCP-Enabled Chatbot** is a production-grade web application that enables conversational interaction with configurable LLM backends while supporting Model Context Protocol (MCP) servers for extended capabilities. Built with TypeScript, React, and Express, designed for air-gap compatibility.

The chatbot acts as an **MCP assistant** - helping developers troubleshoot and develop MCP servers. It has access to MCP tools that can interact with the system.

## Quick Commands

### Development (Containerized - Recommended)
```bash
# Start development environment with hot reload
podman-compose up --build

# View logs
podman-compose logs -f

# Stop services
podman-compose down

# Rebuild after changes
podman-compose up --build
```

### Development (Local - Requires Node.js)
```bash
# Install dependencies
npm install

# Start both frontend and backend
npm run dev

# Run tests
npm test

# Run integration tests
npm run test:integration --workspace=backend

# Build for production
npm run build
```

### Container Management
```bash
# Access backend container
podman exec -it mcp-chatbot-backend sh

# Access frontend container
podman exec -it mcp-chatbot-frontend sh

# View backend logs
podman-compose logs -f backend

# Restart after database issues
podman-compose down && rm backend/data/config.db-journal && podman-compose up
```

## Architecture

### Monorepo Structure
```
mcp-chatbot/
├── backend/          # Express.js API server (port 3000)
│   ├── src/
│   │   ├── api/      # REST endpoints with asyncHandler wrapper
│   │   ├── services/ # Business logic (LLM, Config, MCP)
│   │   ├── db/       # SQLite with encrypted credentials
│   │   └── tests/    # Integration tests (no mocks)
│   └── data/         # SQLite database (persistent volume)
├── frontend/         # React + Vite UI (port 5173)
│   ├── src/
│   │   ├── components/  # Chat & Config UI
│   │   ├── hooks/       # useChat, useConfig (TanStack Query)
│   │   └── services/    # API client with SSE support
├── shared/           # TypeScript types shared between workspaces
│   └── types/        # Message, LLMConfig, MCPServerConfig
└── docker-compose.yml  # Podman/Docker orchestration
```

### Technology Stack

**Backend:**
- Express.js + TypeScript
- OpenAI SDK (for any OpenAI-compatible endpoint)
- @modelcontextprotocol/sdk v1.25.1 (StdioClientTransport, StreamableHTTPClientTransport)
- better-sqlite3 (requires Node 22+)
- Zod for validation
- AES-256-CBC encryption for API keys

**Frontend:**
- React + TypeScript
- Vite build tool
- TanStack Query for server state
- Recharts for data visualization
- Server-Sent Events (SSE) for streaming
- TobyAI branding throughout UI
- No CDN dependencies (air-gap ready)

**Infrastructure:**
- Podman/Docker with compose
- Node 22 Alpine base images
- Rootless containers (Podman)
- Hot reload in development
- Multi-stage builds for production

## Key Design Decisions

### 1. TDD Without Mocks
- **Integration tests** over unit tests
- **Real test servers** instead of mocks (TestLLMServer mimics OpenAI API)
- **In-memory SQLite** for test database
- No jest.mock() or sinon - all tests use real implementations

### 2. Clean Architecture (SOLID)
- **Separation of concerns**: API → Services → Repository
- **Dependency injection**: Services passed to API constructors
- **Single responsibility**: Each service has one job
- **DRY principles**: Extracted helpers (asyncHandler, mapRowToMCPServer, transformation methods)

### 3. Security
- **Encrypted credentials**: API keys encrypted with AES-256-CBC using APP_SECRET
- **Salt derivation**: SHA-256 hash of secret used as salt (NOT hardcoded)
- **Input validation**: Zod schemas for all API inputs
- **Command whitelisting**: MCP server commands validated with regex
- **CORS configuration**: Configurable allowed origins

### 4. Air-Gap Compatibility
- **No CDN dependencies**: All assets bundled
- **Local LLM support**: Works with Ollama, vLLM, LocalAI
- **SQLite database**: No network database required
- **Bundled deployment**: All dependencies in container/tarball

## Important Files

### Backend Core

**backend/src/api/utils.ts** - Async error handler wrapper (eliminates try-catch)
```typescript
export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch((error: Error) => {
      console.error('API Error:', error)
      res.status(500).json({ error: error.message })
    })
  }
}
```

**backend/src/services/llm/LLMService.ts** - OpenAI SDK wrapper with transformations
- `configure(config)` - Set baseURL and apiKey
- `chat(messages, tools?)` - Non-streaming chat
- `chatStream(messages, tools?)` - SSE streaming generator
- `transformToOpenAIMessages()` - Convert Message[] to OpenAI format
- `transformToOpenAITools()` - Convert MCPTool[] to OpenAI format

**backend/src/services/config/EncryptionService.ts** - AES-256-CBC encryption
- CRITICAL: Uses SHA-256 hash of APP_SECRET as salt (NOT hardcoded)
- Changing encryption breaks existing database (expected behavior)

**backend/src/services/chat/ChatOrchestrator.ts** - Chat flow orchestration
- `detectChartsInToolResult()` - Automatically detects chart-worthy data in MCP tool responses
- `analyzeDataForChart()` - Analyzes data structure and creates ChartData objects
- `flattenNestedArrayData()` - Flattens nested data structures for chart rendering
- `filterChartableNumericFields()` - Excludes IDs and prioritizes health metrics
- `selectRelevantMetrics()` - Analyzes user query to show only requested metrics
- Parses JSON strings from MCP text fields
- Streams chart data via SSE using 'chart_data' chunk type

**backend/src/db/repository.ts** - SQLite operations
- `mapRowToMCPServer()` - DRY helper for database row mapping
- Handles LLM config and MCP server CRUD

### Frontend Core

**frontend/src/hooks/useChat.ts** - Chat state management
- System prompt: Forces English responses, automatic date calculation, chart instructions
- Instructs LLM to NOT create markdown tables/ASCII charts
- Message streaming with SSE including chart data
- Error handling and recovery

**frontend/src/hooks/useConfig.ts** - Configuration state with TanStack Query
- Uses `mutateAsync` (NOT `mutate`) for proper promise handling
- Automatic cache invalidation

**frontend/src/components/chat/MessageList.tsx** - Message rendering
- React key: `${message.timestamp}-${message.role}` (NOT index)
- Auto-scroll to bottom on new messages
- Renders ChartRenderer components for chart data
- Logo watermark in background (12% opacity, 80% brightness)

**frontend/src/components/chat/ChartRenderer.tsx** - Chart visualization
- Renders interactive Recharts charts from ChartData
- Supports line, bar, area, and pie charts
- Dark theme optimized with cyan accent colors
- Responsive design with proper spacing
- Automatic X-axis date formatting

**frontend/src/components/chat/MessageInput.tsx** - Message input
- Compact 2-row textarea for more chat space
- Enter to send, Shift+Enter for new line
- Auto-disabled when streaming

**frontend/src/App.tsx** - Main application
- TobyAI logo in header with glow effects
- TobyAI logo in footer center
- Tab navigation (Chat, Settings, About)
- Health status indicator

**frontend/src/components/common/About.tsx** - About page
- TobyAI logo with pulse animation
- Project information and features
- Author contact information
- Technology stack badges

### Shared Types

**shared/types/chat.ts** - Core message types
- `Message`: role, content, tool_calls, tool_call_id, **chartData**, **timestamp** (required for React keys)
- `ToolCall`: OpenAI-compatible tool call format
- `StreamChunk`: SSE chunk types (content, tool_call, chart_data, done, error)
- `ChartData`: Chart configuration with id, type, title, data, xKey, yKeys
- Chart types: 'line', 'bar', 'area', 'pie'

**shared/types/config.ts** - Configuration types
- `LLMConfig`: baseURL, apiKey, model, temperature, maxTokens
- `MCPServerConfig`: stdio or HTTP server configuration

## Environment Variables

```bash
# Required - at least 32 characters
APP_SECRET=your-super-secure-secret-key-here-minimum-32-chars

# Optional
PORT=3000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

## Common Tasks

### Adding a New API Endpoint

1. Define route in `backend/src/api/` class
2. Use `asyncHandler` wrapper for error handling
3. Add Zod schema for validation
4. Update frontend API client in `frontend/src/services/api.ts`
5. Create React Query hook if needed

Example:
```typescript
// backend/src/api/example.ts
import { asyncHandler } from './utils.js'
import { z } from 'zod'

export class ExampleAPI {
  doSomething = asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({ name: z.string() })
    const validation = schema.safeParse(req.body)

    if (!validation.success) {
      res.status(400).json({ error: 'Invalid input', details: validation.error.errors })
      return
    }

    // Do work...
    res.json({ success: true })
  })
}
```

### Adding a New React Component

1. Create component in `frontend/src/components/`
2. Use TypeScript interfaces for props
3. Use React hooks from `frontend/src/hooks/`
4. Follow existing patterns (MessageList, LLMConfig)

### Modifying Database Schema

1. Update SQL in `backend/src/db/schema.ts`
2. Update TypeScript types in `shared/types/`
3. Update repository methods in `backend/src/db/repository.ts`
4. Consider migration strategy (currently: delete database and reconfigure)

### Adding MCP Server Support (Phase 2-3)

1. MCP SDK imported: `@modelcontextprotocol/sdk`
2. Transports available: `StdioClientTransport`, `StreamableHTTPClientTransport`
3. Server lifecycle in `backend/src/services/mcp/MCPService.ts` (to be created)
4. Tool discovery: `client.listTools()`
5. Tool execution: `client.callTool(name, args)`

## Testing Strategy

### Integration Tests (backend/src/tests/)

**TestLLMServer** - Real Express server that mimics OpenAI API
```typescript
const testLLM = new TestLLMServer()
await testLLM.start()
const llmService = new LLMService({ baseURL: testLLM.url, model: 'test' })
// Test with real service...
await testLLM.stop()
```

### Running Tests

```bash
# All tests
npm test

# Backend integration tests
npm run test:integration --workspace=backend

# Watch mode
npm run test:watch --workspace=backend
```

## Troubleshooting

### "Error: error:1C800064:Provider routines::bad decrypt"
- Encryption salt changed (expected after security fix)
- Solution: Delete database and reconfigure
```bash
podman-compose down
rm backend/data/config.db
podman-compose up --build
```

### "Cannot find package 'dotenv'"
- Missing dependency in package.json
- Solution: Add to backend/package.json and rebuild
```bash
npm install dotenv --workspace=backend
podman-compose up --build
```

### "LLM connection failed"
- Check LLM server is running (Ollama: http://localhost:11434)
- Verify baseURL includes `/v1` suffix
- Test directly: `curl http://localhost:11434/v1/models`

### "Database is locked"
- Multiple processes accessing SQLite
- Solution: Stop all containers and remove journal
```bash
podman-compose down
rm backend/data/config.db-journal
podman-compose up
```

### "Form not updating with configuration"
- Missing useEffect to watch config changes
- Solution: Add useEffect in component
```typescript
useEffect(() => {
  if (config?.llm) {
    setFormData({ ...config.llm })
  }
}, [config])
```

## Project Status

### Phase 1: Core Infrastructure ✅ COMPLETE
- [x] Backend API with Express + TypeScript
- [x] Frontend UI with React + Vite
- [x] SQLite database with encrypted credentials
- [x] LLM integration with OpenAI SDK
- [x] SSE streaming chat
- [x] Configuration management UI
- [x] Podman containerization
- [x] Code review and refactoring (DRY, security fixes)

### Phase 2: MCP stdio Integration 🚧 TODO
- [ ] StdioClientTransport implementation
- [ ] Process lifecycle management
- [ ] Tool discovery from stdio servers
- [ ] Tool execution in chat flow

### Phase 3: MCP HTTP/SSE Integration 🚧 TODO
- [ ] StreamableHTTPClientTransport implementation
- [ ] HTTP server configuration UI
- [ ] SSE connection management

### Phase 4: Advanced Configuration 🚧 TODO
- [ ] MCP server enable/disable toggle
- [ ] Server health monitoring
- [ ] Connection status indicators

### Phase 5: Tool Execution 🚧 TODO
- [ ] Automatic tool calling in chat
- [ ] Tool result display
- [ ] Error recovery

### Phase 6: Production Optimizations 🚧 TODO
- [ ] Performance tuning
- [ ] Bundle size optimization
- [ ] Database migrations
- [ ] Monitoring and logging

## Code Style Guidelines

### TypeScript
- Use strict mode
- Prefer interfaces over types for objects
- Use explicit return types on functions
- Avoid `any` - use `unknown` and type guards

### React
- Functional components only (no class components)
- Use TypeScript interfaces for props
- Use stable keys for lists (timestamp, not index)
- Prefer composition over prop drilling

### Error Handling
- Use `asyncHandler` wrapper for API routes
- Return descriptive error messages
- Log errors with `console.error`
- Use Zod for input validation

### Simplicity Over Complexity
- Don't add features that aren't requested
- Don't refactor code that isn't touched
- Extract helpers when DRY violations appear (3+ duplications)
- Keep solutions minimal and focused

## Recent Code Changes

### Security Fix - EncryptionService (2024)
Changed from hardcoded salt to derived salt using SHA-256:
```typescript
// OLD (INSECURE):
const salt = 'hardcoded-salt'

// NEW (SECURE):
const salt = crypto.createHash('sha256').update(secret).digest('hex').slice(0, 16)
```
**Impact:** Invalidated existing encrypted data (expected)

### DRY Refactoring - Repository
Extracted `mapRowToMCPServer()` helper to eliminate ~30 lines of duplication across getAllMCPServers, getEnabledMCPServers, getMCPServer.

### DRY Refactoring - LLMService
Extracted `transformToOpenAIMessages()` and `transformToOpenAITools()` to eliminate duplication in chat() and chatStream().

### Error Handling - asyncHandler
Created wrapper utility to eliminate try-catch in every API method. Centralized error logging and response formatting.

### React Keys - MessageList
Changed from index-based keys to timestamp-based keys for stable rendering:
```typescript
// OLD: key={index}
// NEW: key={`${message.timestamp}-${message.role}`}
```

### System Prompt - useChat
Enhanced system message with automatic date calculation and chart instructions:
```typescript
const systemMessage: Message = {
  role: 'system',
  content: 'You are an MCP (Model Context Protocol) chatbot assistant...' +
    'When users ask for time-based data, calculate dates automatically. Today is ' + new Date().toISOString().split('T')[0] +
    'DO NOT create markdown tables or ASCII charts - the UI handles visualization automatically.',
  timestamp: 0
}
```

### Node 22 Upgrade (December 2024)
Upgraded from Node 20 to Node 22 Alpine:
- Better npm dependency resolution
- Fixes peer dependency conflicts with React 18.3.1
- Added `--legacy-peer-deps` flag to frontend install
- Updated Dockerfiles: `FROM node:22-alpine`

### Automatic Chart Rendering (December 2024)
Added comprehensive chart visualization system:

**Backend (ChatOrchestrator.ts):**
- `detectChartsInToolResult()` - Detects numeric data in MCP tool responses
- `analyzeDataForChart()` - Creates ChartData objects from raw data
- `flattenNestedArrayData()` - Handles nested structures like `{date: "...", stats: {...}}`
- `filterChartableNumericFields()` - Excludes IDs (userProfileId, etc), prioritizes health metrics
- `selectRelevantMetrics()` - Parses user query to show only requested metrics (e.g., "heart rate" → shows only HR)
- Parses JSON strings from MCP text fields (Garmin returns `{type: "text", text: "{...}"}`)
- Streams chart data via SSE using 'chart_data' chunk type

**Frontend:**
- `ChartRenderer.tsx` - Renders Recharts charts (line, bar, area, pie)
- `MessageList.tsx` - Displays charts alongside messages
- `useChat.ts` - Handles chart_data chunks in SSE stream
- Dark theme optimized with cyan accents
- Automatic date formatting on X-axis

**Shared Types:**
- `ChartData` - Chart configuration interface
- `Message.chartData` - Array of charts per message
- `StreamChunk` - Added 'chart_data' type

### TobyAI Branding (December 2024)
Added professional logo throughout the application:
- **Header**: Logo with pulsing glow effect (50px height)
- **Footer**: Centered logo with version info (30px height)
- **Chat Background**: Watermark (576x384px, 12% opacity, 80% brightness)
- **About Page**: Large logo with pulse animation (120px height)
- Logo has transparent background (processed with sharp library)
- Cyan glow effects matching app theme
- Hover effects with scale and brightness

### UI Layout Improvements (December 2024)
Optimized chat interface for better UX:
- Reduced input textarea from 3 rows to 2 rows
- Reduced input padding for compact design
- Larger chat area for more message visibility
- Logo watermark in chat background (non-intrusive)

## External Resources

- [Model Context Protocol Docs](https://modelcontextprotocol.io)
- [OpenAI SDK Docs](https://github.com/openai/openai-node)
- [Recharts Documentation](https://recharts.org)
- [TanStack Query Docs](https://tanstack.com/query)
- [Podman Documentation](https://docs.podman.io)
- [Ollama Setup](https://ollama.ai)
- [vLLM Documentation](https://docs.vllm.ai)

## Notes for Claude Code

- This codebase follows **TDD without mocks** - use real test servers
- All API methods should use **asyncHandler wrapper**
- Database schema changes require **manual migration** (delete and reconfigure)
- Encryption changes **invalidate existing data** (expected behavior)
- Always use **timestamp-based React keys**, never index
- The app is an **MCP assistant** - system prompt enforces this context
- Containerization is **preferred** over local Node.js installation
- This project values **simplicity over complexity**



