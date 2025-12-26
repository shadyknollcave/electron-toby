import { spawn, ChildProcess } from 'child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type {
  MCPServerConfig,
  StdioConfig,
  HTTPConfig,
  MCPTool,
  MCPToolResult,
  MCPServerStatus
} from '../../../../shared/types/index.js'
import type { ConfigService } from '../config/ConfigService.js'

/**
 * Internal connection state for each MCP server
 * Supports both stdio and HTTP/SSE transports
 */
interface MCPConnection {
  serverId: string
  serverName: string
  client: Client
  transport: StdioClientTransport | StreamableHTTPClientTransport
  process?: ChildProcess  // Only for stdio servers
  tools: MCPTool[]
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  error?: string
  lastConnected?: Date
}

/**
 * MCPService manages MCP server connections (stdio and HTTP/SSE) and tool discovery
 *
 * Design principles:
 * - Manages multiple concurrent MCP server connections (stdio + HTTP)
 * - Per-server error isolation (one failure doesn't affect others)
 * - Tool caching (discover once on connection)
 * - Graceful lifecycle management (process for stdio, connection for HTTP)
 * - Manual reconnection (no auto-reconnect in this phase)
 */
export class MCPService {
  private connections: Map<string, MCPConnection> = new Map()
  private configService: ConfigService

  constructor(configService: ConfigService) {
    this.configService = configService
  }

  /**
   * Initialize service by connecting to all enabled MCP servers (stdio and HTTP)
   * Called once during application startup
   */
  async initialize(): Promise<void> {
    const servers = this.configService.getEnabledMCPServers()

    console.log(`🔌 Initializing ${servers.length} enabled MCP servers`)

    // Connect to all servers in parallel (both stdio and HTTP)
    const connectionPromises = servers.map(server =>
      this.connectServer(server).catch(error => {
        console.error(`Failed to connect to MCP server '${server.name}':`, error.message)
        // Don't throw - let other servers connect even if one fails
      })
    )

    await Promise.all(connectionPromises)

    const connectedCount = Array.from(this.connections.values())
      .filter(conn => conn.status === 'connected').length

    console.log(`✅ Connected ${connectedCount}/${servers.length} MCP servers`)
  }

  /**
   * Connect to a single MCP server (routes to stdio or HTTP handler)
   */
  async connectServer(serverConfig: MCPServerConfig): Promise<void> {
    if (serverConfig.type === 'stdio') {
      return this.connectStdioServer(serverConfig)
    } else if (serverConfig.type === 'http') {
      return this.connectHTTPServer(serverConfig)
    } else {
      throw new Error(`Unsupported server type: ${serverConfig.type}`)
    }
  }

  /**
   * Connect to a stdio MCP server
   * Spawns process, establishes MCP connection, discovers tools
   */
  private async connectStdioServer(serverConfig: MCPServerConfig): Promise<void> {

    const serverId = serverConfig.id
    const config = serverConfig.config as StdioConfig

    // Check if already connected
    if (this.connections.has(serverId)) {
      const existing = this.connections.get(serverId)!
      if (existing.status === 'connected' || existing.status === 'connecting') {
        console.log(`MCP server '${serverConfig.name}' already connected`)
        return
      }
    }

    console.log(`Connecting to MCP server '${serverConfig.name}' (${config.command} ${config.args.join(' ')})`)

    // Create connection entry with 'connecting' status
    const connection: Partial<MCPConnection> = {
      serverId,
      serverName: serverConfig.name,
      status: 'connecting',
      tools: []
    }

    try {
      // Create stdio transport (this will spawn the process internally)
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env
      })

      // Create MCP client
      const client = new Client(
        {
          name: 'mcp-chatbot',
          version: '1.0.0'
        },
        {
          capabilities: {}
        }
      )

      // Store transport and client in connection
      connection.transport = transport
      connection.client = client

      // Add to connections map (before connect so event listeners can access it)
      this.connections.set(serverId, connection as MCPConnection)

      // Connect to the MCP server (this starts the process)
      await client.connect(transport)

      // Get the process from transport for monitoring
      const childProcess = (transport as any).process
      if (childProcess) {
        connection.process = childProcess
        this.setupProcessListeners(serverId, childProcess)
      }

      // Discover tools
      const toolsResult = await client.listTools()
      const tools: MCPTool[] = toolsResult.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema as any,
        serverId: serverId
      }))

      // Update connection status
      connection.status = 'connected'
      connection.tools = tools
      connection.lastConnected = new Date()

      console.log(`✅ Connected to MCP server '${serverConfig.name}' - ${tools.length} tools available`)
    } catch (error: any) {
      console.error(`Failed to connect to MCP server '${serverConfig.name}':`, error.message)

      // Mark as error state
      connection.status = 'error'
      connection.error = error.message

      // Cleanup if process was started
      if (connection.process) {
        try {
          connection.process.kill()
        } catch (killError) {
          // Ignore kill errors
        }
      }

      throw error
    }
  }

  /**
   * Connect to an HTTP/SSE MCP server
   * Establishes streamable HTTP connection, discovers tools
   */
  private async connectHTTPServer(serverConfig: MCPServerConfig): Promise<void> {
    const serverId = serverConfig.id
    const config = serverConfig.config as HTTPConfig

    // Check if already connected
    if (this.connections.has(serverId)) {
      const existing = this.connections.get(serverId)!
      if (existing.status === 'connected' || existing.status === 'connecting') {
        console.log(`MCP server '${serverConfig.name}' already connected`)
        return
      }
    }

    console.log(`Connecting to MCP HTTP server '${serverConfig.name}' (${config.url})`)

    // Create connection entry with 'connecting' status
    const connection: Partial<MCPConnection> = {
      serverId,
      serverName: serverConfig.name,
      status: 'connecting',
      tools: []
    }

    try {
      // Create Streamable HTTP transport (handles session management automatically)
      const transport = new StreamableHTTPClientTransport(
        new URL(config.url),
        config.headers ? {
          requestInit: {
            headers: config.headers
          }
        } : undefined
      )

      // Create MCP client
      const client = new Client(
        {
          name: 'mcp-chatbot',
          version: '1.0.0'
        },
        {
          capabilities: {}
        }
      )

      // Store transport and client in connection
      connection.transport = transport
      connection.client = client

      // Add to connections map
      this.connections.set(serverId, connection as MCPConnection)

      // Connect to the MCP HTTP server
      await client.connect(transport)

      // Discover tools
      const toolsResult = await client.listTools()
      const tools: MCPTool[] = toolsResult.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema as any,
        serverId: serverId
      }))

      // Update connection status
      connection.status = 'connected'
      connection.tools = tools
      connection.lastConnected = new Date()

      console.log(`✅ Connected to MCP HTTP server '${serverConfig.name}' - ${tools.length} tools available`)
    } catch (error: any) {
      console.error(`Failed to connect to MCP HTTP server '${serverConfig.name}':`, error.message)

      // Mark as error state
      connection.status = 'error'
      connection.error = error.message

      throw error
    }
  }

  /**
   * Setup event listeners for MCP server process
   */
  private setupProcessListeners(serverId: string, childProcess: ChildProcess): void {
    childProcess.on('exit', (code, signal) => {
      const connection = this.connections.get(serverId)
      if (connection && connection.status === 'connected') {
        console.error(`MCP server '${connection.serverName}' process exited unexpectedly (code: ${code}, signal: ${signal})`)
        connection.status = 'error'
        connection.error = `Process exited with code ${code}`
      }
    })

    childProcess.on('error', (error) => {
      const connection = this.connections.get(serverId)
      if (connection) {
        console.error(`MCP server '${connection.serverName}' process error:`, error.message)
        connection.status = 'error'
        connection.error = error.message
      }
    })

    // Log stderr for debugging
    childProcess.stderr?.on('data', (data) => {
      const connection = this.connections.get(serverId)
      if (connection) {
        console.error(`MCP server '${connection.serverName}' stderr:`, data.toString())
      }
    })
  }

  /**
   * Disconnect from a single MCP server
   * Closes connection and kills process gracefully
   */
  async disconnectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection) {
      console.log(`MCP server ${serverId} not connected`)
      return
    }

    console.log(`Disconnecting from MCP server '${connection.serverName}'`)

    try {
      // Close MCP client connection
      if (connection.client) {
        await connection.client.close()
      }
    } catch (error: any) {
      console.error(`Error closing MCP client for '${connection.serverName}':`, error.message)
    }

    try {
      // Kill the process gracefully
      if (connection.process && !connection.process.killed) {
        connection.process.kill('SIGTERM')

        // Force kill after 5 seconds if still alive
        setTimeout(() => {
          if (connection.process && !connection.process.killed) {
            console.warn(`Force killing MCP server '${connection.serverName}'`)
            connection.process.kill('SIGKILL')
          }
        }, 5000)
      }
    } catch (error: any) {
      console.error(`Error killing MCP process for '${connection.serverName}':`, error.message)
    }

    // Remove from connections map
    this.connections.delete(serverId)

    console.log(`✅ Disconnected from MCP server '${connection.serverName}'`)
  }

  /**
   * Reconnect to a server (disconnect then connect)
   */
  async reconnectServer(serverId: string): Promise<void> {
    await this.disconnectServer(serverId)
    const serverConfig = this.configService.getMCPServer(serverId)
    if (!serverConfig) {
      throw new Error(`MCP server ${serverId} not found in configuration`)
    }
    await this.connectServer(serverConfig)
  }

  /**
   * Gracefully shutdown all MCP connections
   * Called during application shutdown
   */
  async shutdown(): Promise<void> {
    console.log(`Shutting down ${this.connections.size} MCP connections`)

    const disconnectPromises = Array.from(this.connections.keys()).map(serverId =>
      this.disconnectServer(serverId).catch(error => {
        console.error(`Error during MCP shutdown for ${serverId}:`, error.message)
      })
    )

    await Promise.all(disconnectPromises)

    console.log('✅ All MCP connections closed')
  }

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): MCPTool[] {
    const allTools: MCPTool[] = []

    for (const connection of this.connections.values()) {
      if (connection.status === 'connected') {
        allTools.push(...connection.tools)
      }
    }

    return allTools
  }

  /**
   * Get tools from a specific server
   */
  getToolsByServer(serverId: string): MCPTool[] {
    const connection = this.connections.get(serverId)
    if (!connection || connection.status !== 'connected') {
      return []
    }
    return connection.tools
  }

  /**
   * Execute a tool on a specific MCP server
   */
  async executeTool(
    serverId: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<MCPToolResult> {
    const connection = this.connections.get(serverId)

    if (!connection) {
      throw new Error(`MCP server ${serverId} not found`)
    }

    if (connection.status !== 'connected') {
      throw new Error(`MCP server '${connection.serverName}' is not connected (status: ${connection.status})`)
    }

    // Auto-inject today's date for Garmin health tools if date parameter is missing
    // This fixes timezone issues where the Garmin server defaults to UTC
    const garminDateTools = [
      'get_daily_stats', 'get_heart_rate_data', 'get_stress_data',
      'get_sleep_data', 'get_body_battery', 'get_steps_data'
    ]
    if (garminDateTools.includes(toolName)) {
      if (!args.date_str && args.date_str !== '') {
        // Get current date in local timezone (not UTC)
        // The container runs in UTC, but we want the user's local date
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const todayLocal = `${year}-${month}-${day}`
        args.date_str = todayLocal
        console.log(`[MCPService] Auto-injected date_str="${todayLocal}" for ${toolName} (timezone fix)`)
      }
    }

    try {
      console.log(`[MCPService] Calling tool '${toolName}' with arguments:`, JSON.stringify(args, null, 2))

      const result = await connection.client.callTool({
        name: toolName,
        arguments: args
      })

      console.log(`[MCPService] Tool '${toolName}' raw result:`, JSON.stringify(result, null, 2))

      // Validate the result structure
      if (!result.content) {
        console.error(`[MCPService] Tool '${toolName}' returned result without 'content' field`)
        return {
          content: [
            {
              type: 'text',
              text: `Tool '${toolName}' returned invalid response: missing 'content' field.\n\nThe MCP server needs to return: {content: [{type: "text", text: "..."}]}`
            }
          ],
          isError: true
        }
      }

      if (!Array.isArray(result.content)) {
        console.error(`[MCPService] Tool '${toolName}' returned non-array content:`, result.content)
        return {
          content: [
            {
              type: 'text',
              text: `Tool '${toolName}' returned invalid response: 'content' must be an array, got ${typeof result.content}.\n\nThe MCP server needs to return: {content: [{type: "text", text: "..."}]}`
            }
          ],
          isError: true
        }
      }

      if (result.content.length === 0) {
        console.warn(`[MCPService] Tool '${toolName}' returned empty content array`)
        return {
          content: [
            {
              type: 'text',
              text: `Tool '${toolName}' returned no data. This could mean:\n- No data available for the requested parameters\n- The MCP server found nothing to return\n- There may be an issue with the tool implementation\n\nRequested: ${JSON.stringify(args, null, 2)}`
            }
          ],
          isError: false
        }
      }

      // Validate each content item
      const validContent = result.content.filter((item: any) => {
        if (!item || typeof item !== 'object') {
          console.warn(`[MCPService] Skipping invalid content item:`, item)
          return false
        }
        if (!item.type) {
          console.warn(`[MCPService] Content item missing 'type' field:`, item)
          return false
        }
        return true
      })

      if (validContent.length === 0) {
        console.error(`[MCPService] All content items were invalid`)
        return {
          content: [
            {
              type: 'text',
              text: `Tool '${toolName}' returned invalid content items. Each item must have a 'type' field and appropriate data.`
            }
          ],
          isError: true
        }
      }

      console.log(`[MCPService] Tool '${toolName}' returned ${validContent.length} valid content items`)

      return {
        content: validContent,
        isError: Boolean(result.isError)
      }
    } catch (error: any) {
      console.error(`[MCPService] Error executing tool '${toolName}' on '${connection.serverName}':`)
      console.error(`  Error message: ${error.message}`)
      console.error(`  Error stack: ${error.stack}`)

      // Check for specific error patterns
      let errorDetails = error.message
      if (error.message.includes('structured_content must be a dict')) {
        errorDetails = `The MCP server returned invalid data format. It returned a raw list [] instead of proper MCP response format.\n\nThe server should return:\n{\n  "content": [\n    {"type": "text", "text": "your data here"}\n  ]\n}\n\nOriginal error: ${error.message}`
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error calling tool '${toolName}':\n\n${errorDetails}\n\n🔧 Troubleshooting:\n1. Check the MCP server logs for errors\n2. Verify the tool returns proper MCP format: {content: [...]}\n3. Ensure the tool handles empty/no data cases correctly\n4. Test the tool directly: curl -X POST http://your-server/mcp ...`
          }
        ],
        isError: true
      }
    }
  }

  /**
   * Get connection status for a specific server
   */
  getServerStatus(serverId: string): MCPServerStatus | null {
    const connection = this.connections.get(serverId)
    if (!connection) {
      return null
    }

    return {
      id: serverId,
      connected: connection.status === 'connected',
      toolCount: connection.tools.length,
      error: connection.error
    }
  }

  /**
   * Get connection status for all servers
   */
  getAllServerStatuses(): MCPServerStatus[] {
    return Array.from(this.connections.values()).map(conn => ({
      id: conn.serverId,
      connected: conn.status === 'connected',
      toolCount: conn.tools.length,
      error: conn.error
    }))
  }

  /**
   * Check if a server is connected
   */
  isServerConnected(serverId: string): boolean {
    const connection = this.connections.get(serverId)
    if (!connection) return false
    return connection.status === 'connected'
  }
}
