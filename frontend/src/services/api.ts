/// <reference types="vite/client" />

import type {
  Message,
  LLMConfig,
  MCPServerConfig,
  MCPServerRequest,
  HealthCheckResult,
  AppConfig,
  StreamChunk
} from '../../../shared/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export class APIClient {
  private baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  // Health Check
  async healthCheck(): Promise<HealthCheckResult> {
    const response = await fetch(`${this.baseURL}/health`)
    if (!response.ok) {
      throw new Error('Health check failed')
    }
    return response.json()
  }

  // Configuration
  async getConfig(): Promise<AppConfig> {
    const response = await fetch(`${this.baseURL}/config`)
    if (!response.ok) {
      throw new Error('Failed to fetch config')
    }
    return response.json()
  }

  async updateLLMConfig(config: LLMConfig): Promise<void> {
    const response = await fetch(`${this.baseURL}/config/llm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    if (!response.ok) {
      const error = await response.json()
      if (error.details && Array.isArray(error.details)) {
        const messages = error.details.map((d: any) => `${d.path.join('.')}: ${d.message}`).join(', ')
        throw new Error(`${error.error}: ${messages}`)
      }
      throw new Error(error.error || 'Failed to update LLM config')
    }
  }

  async getMCPServers(): Promise<MCPServerConfig[]> {
    const response = await fetch(`${this.baseURL}/config/mcp`)
    if (!response.ok) {
      throw new Error('Failed to fetch MCP servers')
    }
    const data = await response.json()
    return data.servers
  }

  async addMCPServer(server: MCPServerRequest): Promise<MCPServerConfig> {
    const response = await fetch(`${this.baseURL}/config/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(server)
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to add MCP server')
    }
    const data = await response.json()
    return data.server
  }

  async deleteMCPServer(id: string): Promise<void> {
    const response = await fetch(`${this.baseURL}/config/mcp/${id}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error('Failed to delete MCP server')
    }
  }

  async toggleMCPServer(id: string, enabled: boolean): Promise<void> {
    const response = await fetch(`${this.baseURL}/config/mcp/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    })
    if (!response.ok) {
      throw new Error('Failed to toggle MCP server')
    }
  }

  // Chat with SSE streaming
  async *chatStream(messages: Message[]): AsyncGenerator<StreamChunk> {
    const response = await fetch(`${this.baseURL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Chat request failed')
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              return
            }
            try {
              const chunk = JSON.parse(data)
              yield chunk
            } catch (e) {
              console.error('Failed to parse SSE data:', data)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}

export const apiClient = new APIClient()
