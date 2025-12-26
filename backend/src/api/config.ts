import { Request, Response } from 'express'
import { ConfigService } from '../services/config/ConfigService.js'
import { LLMService } from '../services/llm/LLMService.js'
import { MCPService } from '../services/mcp/MCPService.js'
import { asyncHandler } from './utils.js'
import { z } from 'zod'
import type { LLMConfigRequest, MCPServerRequest } from '../../../shared/types/index.js'

const LLMConfigSchema = z.object({
  baseURL: z.string().url(),
  apiKey: z.string().optional().nullable(),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().positive().optional().nullable(),
  topP: z.number().min(0).max(1).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  systemPrompt: z.string().optional().nullable()
})

const StdioMCPServerSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.literal('stdio'),
  config: z.object({
    command: z.string().regex(/^[a-zA-Z0-9_\-\/\.]+$/),
    args: z.array(z.string()),
    env: z.record(z.string()).optional()
  })
})

const HTTPMCPServerSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.literal('http'),
  config: z.object({
    url: z.string().url(),
    headers: z.record(z.string()).optional()
  })
})

const MCPServerSchema = z.union([StdioMCPServerSchema, HTTPMCPServerSchema])

export class ConfigAPI {
  constructor(
    private configService: ConfigService,
    private llmService: LLMService,
    private mcpService: MCPService
  ) {}

  // Get all config
  getConfig = asyncHandler(async (req: Request, res: Response) => {
    const llmConfig = this.configService.getLLMConfig()
    const mcpServers = this.configService.getAllMCPServers()

    res.json({
      llm: llmConfig,
      mcpServers
    })
  })

  // Update LLM config
  async updateLLMConfig(req: Request, res: Response): Promise<void> {
    try {
      const validation = LLMConfigSchema.safeParse(req.body)
      if (!validation.success) {
        res.status(400).json({
          error: 'Invalid configuration',
          details: validation.error.errors
        })
        return
      }

      const config = validation.data

      // Test connection before saving
      const testService = new LLMService(config)
      const healthy = await testService.healthCheck()

      if (!healthy) {
        res.status(400).json({
          error: `Cannot connect to LLM endpoint at ${config.baseURL}`
        })
        return
      }

      // Save config
      this.configService.saveLLMConfig(config)

      // Reconfigure the main LLM service
      this.llmService.configure(config)

      res.json({
        success: true,
        config: {
          ...config,
          apiKey: config.apiKey ? '***' : undefined
        }
      })
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Get all MCP servers
  getMCPServers = asyncHandler(async (req: Request, res: Response) => {
    const servers = this.configService.getAllMCPServers()
    res.json({ servers })
  })

  // Add MCP server
  addMCPServer = asyncHandler(async (req: Request, res: Response) => {
    const validation = MCPServerSchema.safeParse(req.body)
    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid server configuration',
        details: validation.error.errors
      })
      return
    }

    const { name, type, config } = validation.data
    const server = this.configService.addMCPServer(name, type, config)

    // Connect server if enabled (works for both stdio and HTTP)
    if (server.enabled) {
      try {
        await this.mcpService.connectServer(server)
      } catch (error: any) {
        console.error(`Failed to connect MCP server '${server.name}':`, error.message)
        // Still return success - server is saved, just not connected
      }
    }

    res.status(201).json({ server })
  })

  // Delete MCP server
  deleteMCPServer = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params

    const server = this.configService.getMCPServer(id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    // Disconnect server first if it's connected
    await this.mcpService.disconnectServer(id)

    // Then delete from database
    this.configService.deleteMCPServer(id)

    res.json({ success: true })
  })

  // Toggle MCP server
  toggleMCPServer = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const { enabled } = req.body

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' })
      return
    }

    const server = this.configService.getMCPServer(id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    // Update database first
    this.configService.toggleMCPServer(id, enabled)

    // Then connect or disconnect (works for both stdio and HTTP)
    if (enabled) {
      try {
        await this.mcpService.connectServer({ ...server, enabled: true })
      } catch (error: any) {
        console.error(`Failed to connect MCP server '${server.name}':`, error.message)
        // Return success anyway - toggle saved, just connection failed
      }
    } else {
      await this.mcpService.disconnectServer(id)
    }

    res.json({ success: true })
  })
}
