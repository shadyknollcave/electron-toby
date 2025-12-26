import { Request, Response, NextFunction } from 'express'
import { MCPService } from '../services/mcp/MCPService.js'
import { asyncHandler } from './utils.js'

/**
 * MCPAPI provides endpoints for interacting with MCP servers
 * - List available tools from all connected servers
 * - Get connection status for servers
 * - Manually reconnect servers
 */
export class MCPAPI {
  constructor(private mcpService: MCPService) {}

  /**
   * GET /api/mcp/tools
   * List all available tools from all connected MCP servers
   */
  getTools = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const tools = this.mcpService.getAllTools()

    res.json({
      tools,
      count: tools.length
    })
  })

  /**
   * GET /api/mcp/status
   * Get connection status for all MCP servers
   */
  getStatus = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const statuses = this.mcpService.getAllServerStatuses()

    const summary = {
      total: statuses.length,
      connected: statuses.filter(s => s.connected).length,
      disconnected: statuses.filter(s => !s.connected).length,
      totalTools: statuses.reduce((sum, s) => sum + s.toolCount, 0)
    }

    res.json({
      summary,
      servers: statuses
    })
  })

  /**
   * POST /api/mcp/servers/:id/reconnect
   * Manually reconnect to a specific MCP server
   */
  reconnectServer = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params

    try {
      await this.mcpService.reconnectServer(id)
      res.json({ success: true, message: 'Server reconnected successfully' })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })
}
