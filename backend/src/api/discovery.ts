import { Request, Response, NextFunction } from 'express'
import { MCPService } from '../services/mcp/MCPService.js'
import {
  MCP_SERVER_CATALOG,
  getServerTemplate,
  getServersByCategory,
  searchServers
} from '../services/mcp/MCPServerCatalog.js'
import { asyncHandler } from './utils.js'

/**
 * Discovery API - MCP Server and Tool Discovery
 *
 * Provides endpoints for discovering available MCP servers and tools
 * in air-gap environments using a pre-populated catalog.
 */
export class DiscoveryAPI {
  constructor(private mcpService: MCPService) {}

  /**
   * GET /api/discovery/catalog
   * Get the full MCP server catalog
   */
  getCatalog = asyncHandler(async (_req: Request, res: Response, next: NextFunction) => {
    res.json({
      servers: MCP_SERVER_CATALOG,
      count: MCP_SERVER_CATALOG.length
    })
  })

  /**
   * GET /api/discovery/catalog/:id
   * Get a specific server template by ID
   */
  getServerTemplate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params
    const template = getServerTemplate(id)

    if (!template) {
      res.status(404).json({ error: `Server template '${id}' not found` })
      return
    }

    res.json(template)
  })

  /**
   * GET /api/discovery/catalog/category/:category
   * Get servers by category
   */
  getServersByCategory = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { category } = req.params as { category: any }
    const servers = getServersByCategory(category)

    res.json({
      category,
      servers,
      count: servers.length
    })
  })

  /**
   * GET /api/discovery/catalog/search?q=keyword
   * Search servers by keyword
   */
  searchCatalog = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const keyword = req.query.q as string

    if (!keyword) {
      res.status(400).json({ error: 'Missing search query parameter "q"' })
      return
    }

    const results = searchServers(keyword)

    res.json({
      query: keyword,
      results,
      count: results.length
    })
  })

  /**
   * GET /api/discovery/tools
   * Get all available tools from connected MCP servers
   */
  getAvailableTools = asyncHandler(async (_req: Request, res: Response, next: NextFunction) => {
    const tools = this.mcpService.getAllTools()

    // Group tools by server
    const toolsByServer: Record<string, any[]> = {}

    for (const tool of tools) {
      if (!toolsByServer[tool.serverId]) {
        toolsByServer[tool.serverId] = []
      }
      toolsByServer[tool.serverId].push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      })
    }

    res.json({
      tools,
      toolsByServer,
      totalTools: tools.length,
      connectedServers: Object.keys(toolsByServer).length
    })
  })

  /**
   * GET /api/discovery/tools/:serverId
   * Get tools from a specific connected server
   */
  getToolsByServer = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { serverId } = req.params
    const tools = this.mcpService.getToolsByServer(serverId)

    res.json({
      serverId,
      tools,
      count: tools.length
    })
  })

  /**
   * POST /api/discovery/tools/:serverId/:toolName/test
   * Test a tool with sample arguments
   */
  testTool = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { serverId, toolName } = req.params
    const { arguments: args } = req.body

    if (!args || typeof args !== 'object') {
      res.status(400).json({ error: 'Missing or invalid "arguments" in request body' })
      return
    }

    try {
      const result = await this.mcpService.executeTool(serverId, toolName, args)
      res.json({
        success: true,
        serverId,
        toolName,
        arguments: args,
        result
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        serverId,
        toolName,
        arguments: args,
        error: error.message
      })
    }
  })

  /**
   * GET /api/discovery/status
   * Get discovery system status and statistics
   */
  getDiscoveryStatus = asyncHandler(async (_req: Request, res: Response, next: NextFunction) => {
    const allTools = this.mcpService.getAllTools()
    const connectedServers = new Set(allTools.map(t => t.serverId))

    res.json({
      catalogSize: MCP_SERVER_CATALOG.length,
      categories: ['filesystem', 'database', 'api', 'productivity', 'development', 'custom'],
      connectedServers: connectedServers.size,
      availableTools: allTools.length,
      airgapMode: true
    })
  })
}
