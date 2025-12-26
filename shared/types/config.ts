import { MCPServerConfig } from './mcp.js'

export interface LLMConfig {
  baseURL: string
  apiKey?: string
  model: string
  temperature?: number
  maxTokens?: number
  topP?: number
  presencePenalty?: number
  frequencyPenalty?: number
  systemPrompt?: string
}

export interface AppConfig {
  llm: LLMConfig
  mcpServers: MCPServerConfig[]
}

export interface LLMConfigRequest {
  baseURL: string
  apiKey?: string
  model: string
  temperature?: number
  maxTokens?: number
  topP?: number
  presencePenalty?: number
  frequencyPenalty?: number
  systemPrompt?: string
}

export interface MCPServerRequest {
  name: string
  type: 'stdio' | 'http'
  config: {
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    headers?: Record<string, string>
  }
}

export interface ValidationResult {
  valid: boolean
  error?: string
  toolCount?: number
  tools?: string[]
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy'
  llm: {
    configured: boolean
    reachable: boolean
    error?: string
  }
  mcpServers: Array<{
    id: string
    name: string
    connected: boolean
    toolCount: number
  }>
}
