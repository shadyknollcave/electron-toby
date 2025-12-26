import Database from 'better-sqlite3'
import { LLMConfig, MCPServerConfig } from '../../../shared/types/index.js'
import { EncryptionService } from '../services/config/EncryptionService.js'

export class Repository {
  constructor(
    private db: Database.Database,
    private encryption: EncryptionService
  ) {}

  // LLM Config Operations
  getLLMConfig(): LLMConfig | null {
    const row = this.db
      .prepare('SELECT * FROM llm_config WHERE id = 1')
      .get() as any

    if (!row) return null

    return {
      baseURL: row.base_url,
      apiKey: row.api_key_encrypted
        ? this.encryption.decrypt(row.api_key_encrypted)
        : undefined,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.max_tokens,
      topP: row.top_p,
      presencePenalty: row.presence_penalty,
      frequencyPenalty: row.frequency_penalty,
      systemPrompt: row.system_prompt
    }
  }

  saveLLMConfig(config: LLMConfig): void {
    const apiKeyEncrypted = config.apiKey
      ? this.encryption.encrypt(config.apiKey)
      : null

    const stmt = this.db.prepare(`
      INSERT INTO llm_config (id, base_url, api_key_encrypted, model, temperature, max_tokens,
                              top_p, presence_penalty, frequency_penalty, system_prompt, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        base_url = excluded.base_url,
        api_key_encrypted = excluded.api_key_encrypted,
        model = excluded.model,
        temperature = excluded.temperature,
        max_tokens = excluded.max_tokens,
        top_p = excluded.top_p,
        presence_penalty = excluded.presence_penalty,
        frequency_penalty = excluded.frequency_penalty,
        system_prompt = excluded.system_prompt,
        updated_at = CURRENT_TIMESTAMP
    `)

    stmt.run(
      config.baseURL,
      apiKeyEncrypted,
      config.model,
      config.temperature ?? 0.7,
      config.maxTokens ?? null,
      config.topP ?? 1.0,
      config.presencePenalty ?? 0.0,
      config.frequencyPenalty ?? 0.0,
      config.systemPrompt ?? null
    )
  }

  // MCP Server Operations
  private mapRowToMCPServer(row: any): MCPServerConfig {
    return {
      id: row.id,
      name: row.name,
      type: row.type as 'stdio' | 'http',
      enabled: row.enabled === 1,
      config: JSON.parse(row.config),
      createdAt: row.created_at
    }
  }

  getAllMCPServers(): MCPServerConfig[] {
    const rows = this.db
      .prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC')
      .all() as any[]

    return rows.map(row => this.mapRowToMCPServer(row))
  }

  getEnabledMCPServers(): MCPServerConfig[] {
    const rows = this.db
      .prepare('SELECT * FROM mcp_servers WHERE enabled = 1 ORDER BY created_at DESC')
      .all() as any[]

    return rows.map(row => this.mapRowToMCPServer(row))
  }

  getMCPServer(id: string): MCPServerConfig | null {
    const row = this.db
      .prepare('SELECT * FROM mcp_servers WHERE id = ?')
      .get(id) as any

    if (!row) return null

    return this.mapRowToMCPServer(row)
  }

  saveMCPServer(server: MCPServerConfig): void {
    const stmt = this.db.prepare(`
      INSERT INTO mcp_servers (id, name, type, config, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      server.id,
      server.name,
      server.type,
      JSON.stringify(server.config),
      server.enabled ? 1 : 0,
      server.createdAt
    )
  }

  updateMCPServer(id: string, updates: Partial<MCPServerConfig>): void {
    const fields: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?')
      values.push(updates.enabled ? 1 : 0)
    }
    if (updates.config !== undefined) {
      fields.push('config = ?')
      values.push(JSON.stringify(updates.config))
    }

    if (fields.length === 0) return

    values.push(id)
    const stmt = this.db.prepare(`
      UPDATE mcp_servers SET ${fields.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)
  }

  deleteMCPServer(id: string): void {
    this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
  }

  // Chat History Operations
  saveChatHistory(id: string, messages: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO chat_history (id, messages, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `)
    stmt.run(id, JSON.stringify(messages))
  }

  getChatHistory(id: string): any[] | null {
    const row = this.db
      .prepare('SELECT messages FROM chat_history WHERE id = ?')
      .get(id) as any

    if (!row) return null
    return JSON.parse(row.messages)
  }
}
