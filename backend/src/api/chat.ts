import { Request, Response, NextFunction } from 'express'
import { LLMService } from '../services/llm/LLMService.js'
import { MCPService } from '../services/mcp/MCPService.js'
import { ChatOrchestrator } from '../services/chat/ChatOrchestrator.js'
import type { ChatRequest, Message } from '../../../shared/types/index.js'
import { z } from 'zod'

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system', 'tool']),
      content: z.string(),
      tool_calls: z.any().optional(),
      tool_call_id: z.string().optional(),
      timestamp: z.number().optional()
    })
  )
})

export class ChatAPI {
  private chatOrchestrator: ChatOrchestrator

  constructor(
    private llmService: LLMService,
    private mcpService: MCPService
  ) {
    this.chatOrchestrator = new ChatOrchestrator(llmService, mcpService)
  }

  async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate request
      const validation = ChatRequestSchema.safeParse(req.body)
      if (!validation.success) {
        res.status(400).json({
          error: 'Invalid request',
          details: validation.error.errors
        })
        return
      }

      const { messages } = validation.data

      // Add timestamps to messages if missing (required by Message interface)
      const messagesWithTimestamps: Message[] = messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp || Date.now()
      }))

      // Check if LLM is configured
      if (!this.llmService.isConfigured()) {
        res.status(503).json({
          error: 'LLM service not configured. Please configure via /api/config/llm'
        })
        return
      }

      // Get available MCP tools
      const mcpTools = this.mcpService.getAllTools()

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      // Stream response with tool execution
      try {
        for await (const chunk of this.chatOrchestrator.chatWithTools(messagesWithTimestamps, mcpTools)) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`)
        }
        res.write('data: [DONE]\n\n')
        res.end()
      } catch (error: any) {
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: error.message
          })}\n\n`
        )
        res.end()
      }
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({
          error: error.message
        })
      }
    }
  }
}
