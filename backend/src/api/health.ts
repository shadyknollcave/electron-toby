import { Request, Response, NextFunction } from 'express'
import { LLMService } from '../services/llm/LLMService.js'
import { ConfigService } from '../services/config/ConfigService.js'
import { MCPService } from '../services/mcp/MCPService.js'
import type { HealthCheckResult } from '../../../shared/types/index.js'

export class HealthAPI {
  constructor(
    private llmService: LLMService,
    private configService: ConfigService,
    private mcpService: MCPService
  ) {}

  async check(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const llmConfig = this.configService.getLLMConfig()
      const mcpServers = this.configService.getEnabledMCPServers()

      // Check LLM health
      let llmReachable = false
      let llmError: string | undefined

      if (llmConfig && this.llmService.isConfigured()) {
        try {
          llmReachable = await this.llmService.healthCheck()
        } catch (error: any) {
          llmError = error.message
        }
      }

      // Get MCP server statuses
      const mcpStatuses = this.mcpService.getAllServerStatuses()
      const mcpServersStatus = mcpServers.map(server => {
        const status = mcpStatuses.find(s => s.id === server.id)
        return {
          id: server.id,
          name: server.name,
          connected: status?.connected || false,
          toolCount: status?.toolCount || 0,
          error: status?.error
        }
      })

      const result: HealthCheckResult = {
        status: llmReachable ? 'healthy' : 'unhealthy',
        llm: {
          configured: llmConfig !== null,
          reachable: llmReachable,
          error: llmError
        },
        mcpServers: mcpServersStatus
      }

      res.json(result)
    } catch (error: any) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message
      })
    }
  }
}
