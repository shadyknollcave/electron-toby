import express from 'express'
import cors from 'cors'
import { config as dotenvConfig } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import type { Server } from 'http'
import { initializeDatabase } from './db/schema.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import { Repository } from './db/repository.js'
import { EncryptionService } from './services/config/EncryptionService.js'
import { ConfigService } from './services/config/ConfigService.js'
import { LLMService } from './services/llm/LLMService.js'
import { MCPService } from './services/mcp/MCPService.js'
import { ChatAPI } from './api/chat.js'
import { ConfigAPI } from './api/config.js'
import { HealthAPI } from './api/health.js'
import { MCPAPI } from './api/mcp.js'
import { DiscoveryAPI } from './api/discovery.js'

// Load environment variables (for web mode)
dotenvConfig()

/**
 * Server configuration options
 * Used by both web mode and Electron mode
 */
export interface ServerOptions {
  databasePath?: string
  appSecret?: string
  port?: number
  frontendURL?: string
}

/**
 * Get configuration from options or environment variables
 * Options take precedence over environment variables
 */
function getServerConfig(options?: ServerOptions) {
  const PORT = options?.port || Number(process.env.PORT) || 3000
  const APP_SECRET = options?.appSecret || process.env.APP_SECRET
  const DATABASE_PATH = options?.databasePath || process.env.DATABASE_PATH || './data/config.db'
  const FRONTEND_URL = options?.frontendURL || process.env.FRONTEND_URL || 'http://localhost:5173'

  if (!APP_SECRET) {
    throw new Error('APP_SECRET is required (provide via options or environment variable)')
  }

  return { PORT, APP_SECRET, DATABASE_PATH, FRONTEND_URL }
}

/**
 * Start the Express server
 * @param options - Server configuration options
 * @returns HTTP server instance
 */
export async function startServer(options?: ServerOptions): Promise<Server> {
  // Get configuration
  const { PORT, APP_SECRET, DATABASE_PATH, FRONTEND_URL } = getServerConfig(options)

  // Initialize services
  const db = initializeDatabase(DATABASE_PATH)
  const encryption = new EncryptionService(APP_SECRET)
  const repository = new Repository(db, encryption)
  const configService = new ConfigService(repository)

  // Initialize MCP service
  const mcpService = new MCPService(configService)

  // Initialize LLM service with saved config (if exists)
  const llmConfig = configService.getLLMConfig()
  const llmService = new LLMService(llmConfig || undefined)

  // Initialize API handlers
  const chatAPI = new ChatAPI(llmService, mcpService)
  const configAPI = new ConfigAPI(configService, llmService, mcpService)
  const healthAPI = new HealthAPI(llmService, configService, mcpService)
  const mcpAPI = new MCPAPI(mcpService)
  const discoveryAPI = new DiscoveryAPI(mcpService)

  // Create Express app
  const app = express()

  // Request logging
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`)
    next()
  })

  // Middleware
  app.use(cors({
    origin: FRONTEND_URL.split(','),
    credentials: true
  }))
  app.use(express.json())

  // Serve static frontend files in Electron mode (detected by custom databasePath)
  const isElectronMode = options?.databasePath !== undefined
  let frontendPath = ''

  if (isElectronMode) {
    // Use path.join for better Windows compatibility
    frontendPath = path.join(__dirname, '..', '..', '..', '..', 'electron', 'dist', 'renderer')
    frontendPath = path.normalize(frontendPath)

    console.log('🖥️  Electron mode: Serving static frontend from:', frontendPath)

    // Explicit root route handler
    app.get('/', (req, res) => {
      const indexPath = path.join(frontendPath, 'index.html')
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error('Error sending index.html:', err)
          res.status(500).send('Error loading application')
        }
      })
    })

    // Serve static files (assets, JS, CSS, etc.)
    app.use(express.static(frontendPath, { index: false }))
  }

  // API Routes
  app.get('/api/health', (req, res, next) => healthAPI.check(req, res, next))

  app.get('/api/config', (req, res, next) => configAPI.getConfig(req, res, next))
  app.put('/api/config/llm', (req, res, next) => configAPI.updateLLMConfig(req, res, next))

  app.get('/api/config/mcp', (req, res, next) => configAPI.getMCPServers(req, res, next))
  app.post('/api/config/mcp', (req, res, next) => configAPI.addMCPServer(req, res, next))
  app.delete('/api/config/mcp/:id', (req, res, next) => configAPI.deleteMCPServer(req, res, next))
  app.patch('/api/config/mcp/:id/toggle', (req, res, next) => configAPI.toggleMCPServer(req, res, next))

  app.get('/api/mcp/tools', (req, res, next) => mcpAPI.getTools(req, res, next))
  app.get('/api/mcp/status', (req, res, next) => mcpAPI.getStatus(req, res, next))
  app.post('/api/mcp/servers/:id/reconnect', (req, res, next) => mcpAPI.reconnectServer(req, res, next))

  app.get('/api/discovery/catalog', (req, res, next) => discoveryAPI.getCatalog(req, res, next))
  app.get('/api/discovery/catalog/:id', (req, res, next) => discoveryAPI.getServerTemplate(req, res, next))
  app.get('/api/discovery/catalog/category/:category', (req, res, next) => discoveryAPI.getServersByCategory(req, res, next))
  app.get('/api/discovery/catalog/search', (req, res, next) => discoveryAPI.searchCatalog(req, res, next))
  app.get('/api/discovery/tools', (req, res, next) => discoveryAPI.getAvailableTools(req, res, next))
  app.get('/api/discovery/tools/:serverId', (req, res, next) => discoveryAPI.getToolsByServer(req, res, next))
  app.post('/api/discovery/tools/:serverId/:toolName/test', (req, res, next) => discoveryAPI.testTool(req, res, next))
  app.get('/api/discovery/status', (req, res, next) => discoveryAPI.getDiscoveryStatus(req, res, next))

  app.post('/api/chat', (req, res, next) => chatAPI.chat(req, res, next))

  // Catch-all route for Electron mode - serve index.html for client-side routing
  if (isElectronMode && frontendPath) {
    app.get('*', (req, res) => {
      const indexPath = path.join(frontendPath, 'index.html')
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error('Error serving index.html:', err)
          res.status(500).send('Error loading application')
        }
      })
    })
  }

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err)
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    })
  })

  try {
    // Connect to enabled MCP servers
    await mcpService.initialize()
  } catch (error) {
    console.error('Error initializing MCP service:', error)
    // Don't throw - continue without MCP servers
  }

  // Start HTTP server and wait for it to be ready
  const server = await new Promise<Server>((resolve, reject) => {
    const httpServer = app.listen(PORT, () => {
      console.log(`🚀 MCP Chatbot server running on http://localhost:${PORT}`)
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`)
      console.log(`💾 Database: ${DATABASE_PATH}`)

      if (llmConfig) {
        console.log(`🤖 LLM configured: ${llmConfig.baseURL} (${llmConfig.model})`)
      } else {
        console.log('⚠️  LLM not configured. Please configure via Settings')
      }

      // Server is now listening - resolve the promise
      resolve(httpServer)
    })

    httpServer.on('error', (err) => {
      console.error('Server failed to start:', err)
      reject(err)
    })
  })

  // Graceful shutdown handler (only for web mode)
  if (!options) {
    const shutdown = async (signal: string) => {
      console.log(`${signal} received, shutting down gracefully`)

      server.close(async () => {
        console.log('Server closed')

        // Shutdown MCP connections
        await mcpService.shutdown()

        // Close database
        db.close()

        process.exit(0)
      })
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }

  return server
}

// Web mode: Start server immediately (no options provided)
// Electron mode: Export function to be called with options
if (!process.env.ELECTRON_MODE) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error)
    process.exit(1)
  })
}
