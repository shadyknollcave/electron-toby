import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { MCPService } from './MCPService.js'
import { ConfigService } from '../config/ConfigService.js'
import { Repository } from '../../db/repository.js'
import { EncryptionService } from '../config/EncryptionService.js'
import { initializeDatabase } from '../../db/schema.js'
import { TestMCPServer } from '../../tests/helpers/TestMCPServer.js'
import type { MCPServerConfig } from '../../../../shared/types/index.js'
import type { Database } from 'better-sqlite3'

describe('MCPService', () => {
  let db: Database
  let repository: Repository
  let configService: ConfigService
  let mcpService: MCPService
  let testServer: TestMCPServer

  beforeEach(async () => {
    // Setup in-memory database
    db = initializeDatabase(':memory:')
    const encryption = new EncryptionService('test-secret-key-at-least-32-chars')
    repository = new Repository(db, encryption)
    configService = new ConfigService(repository)
    mcpService = new MCPService(configService)

    // Setup test MCP server
    testServer = new TestMCPServer({
      tools: [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string' }
            },
            required: ['input']
          }
        }
      ]
    })
  })

  afterEach(async () => {
    // Cleanup
    await mcpService.shutdown()
    await testServer.cleanup()
    db.close()
  })

  describe('connectServer', () => {
    test('should connect to MCP server and discover tools', async () => {
      const config = await testServer.setup()

      const serverConfig: MCPServerConfig = {
        id: 'test-1',
        name: 'Test Server',
        type: 'stdio',
        enabled: true,
        config: config,
        createdAt: new Date().toISOString()
      }

      await mcpService.connectServer(serverConfig)

      // Check connection status
      expect(mcpService.isServerConnected('test-1')).toBe(true)

      // Check tools are discovered
      const tools = mcpService.getToolsByServer('test-1')
      expect(tools).toHaveLength(1)
      expect(tools[0].name).toBe('test_tool')
      expect(tools[0].description).toBe('A test tool')
      expect(tools[0].serverId).toBe('test-1')

      // Check server status
      const status = mcpService.getServerStatus('test-1')
      expect(status).toBeDefined()
      expect(status!.connected).toBe(true)
      expect(status!.toolCount).toBe(1)
    })

    test('should handle multiple servers concurrently', async () => {
      // Setup two test servers
      const server1Config = await testServer.setup()

      const testServer2 = new TestMCPServer({
        tools: [
          {
            name: 'another_tool',
            description: 'Another test tool',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      })
      const server2Config = await testServer2.setup()

      const config1: MCPServerConfig = {
        id: 'test-1',
        name: 'Server 1',
        type: 'stdio',
        enabled: true,
        config: server1Config,
        createdAt: new Date().toISOString()
      }

      const config2: MCPServerConfig = {
        id: 'test-2',
        name: 'Server 2',
        type: 'stdio',
        enabled: true,
        config: server2Config,
        createdAt: new Date().toISOString()
      }

      // Connect both servers
      await Promise.all([
        mcpService.connectServer(config1),
        mcpService.connectServer(config2)
      ])

      // Both should be connected
      expect(mcpService.isServerConnected('test-1')).toBe(true)
      expect(mcpService.isServerConnected('test-2')).toBe(true)

      // Tools should be aggregated
      const allTools = mcpService.getAllTools()
      expect(allTools).toHaveLength(2)
      expect(allTools.some(t => t.name === 'test_tool')).toBe(true)
      expect(allTools.some(t => t.name === 'another_tool')).toBe(true)

      await testServer2.cleanup()
    }, 10000) // Increase timeout for this test

    test('should not connect same server twice', async () => {
      const config = await testServer.setup()

      const serverConfig: MCPServerConfig = {
        id: 'test-1',
        name: 'Test Server',
        type: 'stdio',
        enabled: true,
        config: config,
        createdAt: new Date().toISOString()
      }

      await mcpService.connectServer(serverConfig)

      // Try to connect again - should not throw
      await mcpService.connectServer(serverConfig)

      // Should still only have one connection
      expect(mcpService.isServerConnected('test-1')).toBe(true)
    })
  })

  describe('disconnectServer', () => {
    test('should disconnect server and cleanup resources', async () => {
      const config = await testServer.setup()

      const serverConfig: MCPServerConfig = {
        id: 'test-1',
        name: 'Test Server',
        type: 'stdio',
        enabled: true,
        config: config,
        createdAt: new Date().toISOString()
      }

      await mcpService.connectServer(serverConfig)
      expect(mcpService.isServerConnected('test-1')).toBe(true)

      await mcpService.disconnectServer('test-1')

      expect(mcpService.isServerConnected('test-1')).toBe(false)
      expect(mcpService.getServerStatus('test-1')).toBeNull()
      expect(mcpService.getToolsByServer('test-1')).toHaveLength(0)
    })

    test('should handle disconnect when not connected', async () => {
      // Should not throw
      await mcpService.disconnectServer('non-existent')
    })

    test('should support multiple connect/disconnect cycles', async () => {
      const config = await testServer.setup()

      const serverConfig: MCPServerConfig = {
        id: 'test-1',
        name: 'Test Server',
        type: 'stdio',
        enabled: true,
        config: config,
        createdAt: new Date().toISOString()
      }

      // Connect, disconnect, reconnect
      await mcpService.connectServer(serverConfig)
      expect(mcpService.isServerConnected('test-1')).toBe(true)

      await mcpService.disconnectServer('test-1')
      expect(mcpService.isServerConnected('test-1')).toBe(false)

      await mcpService.connectServer(serverConfig)
      expect(mcpService.isServerConnected('test-1')).toBe(true)
    }, 10000)
  })

  describe('executeTool', () => {
    test('should execute tool and return result', async () => {
      const config = await testServer.setup()

      testServer.setToolResponse('test_tool', {
        content: [
          {
            type: 'text',
            text: 'Custom tool result'
          }
        ]
      })

      const serverConfig: MCPServerConfig = {
        id: 'test-1',
        name: 'Test Server',
        type: 'stdio',
        enabled: true,
        config: config,
        createdAt: new Date().toISOString()
      }

      await mcpService.connectServer(serverConfig)

      const result = await mcpService.executeTool('test-1', 'test_tool', {
        input: 'test value'
      })

      expect(result.content).toBeDefined()
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toBe('Custom tool result')
      expect(result.isError).toBeFalsy()
    })

    test('should return error when server not connected', async () => {
      await expect(
        mcpService.executeTool('non-existent', 'test_tool', {})
      ).rejects.toThrow('MCP server non-existent not found')
    })
  })

  describe('shutdown', () => {
    test('should disconnect all servers on shutdown', async () => {
      const config = await testServer.setup()

      const serverConfig: MCPServerConfig = {
        id: 'test-1',
        name: 'Test Server',
        type: 'stdio',
        enabled: true,
        config: config,
        createdAt: new Date().toISOString()
      }

      await mcpService.connectServer(serverConfig)
      expect(mcpService.isServerConnected('test-1')).toBe(true)

      await mcpService.shutdown()

      expect(mcpService.isServerConnected('test-1')).toBe(false)
      expect(mcpService.getAllTools()).toHaveLength(0)
    })
  })

  describe('initialize', () => {
    test('should connect all enabled stdio servers on initialization', async () => {
      const config = await testServer.setup()

      // Add server to config service
      configService.addMCPServer('Test Server', 'stdio', config)

      // Initialize MCPService
      await mcpService.initialize()

      // Should be connected
      const allStatuses = mcpService.getAllServerStatuses()
      expect(allStatuses.length).toBeGreaterThan(0)
    }, 10000)
  })

  describe('error handling', () => {
    test('should handle bad command gracefully', async () => {
      const serverConfig: MCPServerConfig = {
        id: 'test-bad',
        name: 'Bad Server',
        type: 'stdio',
        enabled: true,
        config: {
          command: 'nonexistent-command-xyz',
          args: []
        },
        createdAt: new Date().toISOString()
      }

      // Should throw but not crash
      await expect(
        mcpService.connectServer(serverConfig)
      ).rejects.toThrow()

      // Status should show error
      const status = mcpService.getServerStatus('test-bad')
      expect(status?.connected).toBe(false)
      expect(status?.error).toBeDefined()
    })

    test('should isolate errors between servers', async () => {
      const goodConfig = await testServer.setup()

      const goodServer: MCPServerConfig = {
        id: 'good-server',
        name: 'Good Server',
        type: 'stdio',
        enabled: true,
        config: goodConfig,
        createdAt: new Date().toISOString()
      }

      const badServer: MCPServerConfig = {
        id: 'bad-server',
        name: 'Bad Server',
        type: 'stdio',
        enabled: true,
        config: {
          command: 'nonexistent-command',
          args: []
        },
        createdAt: new Date().toISOString()
      }

      // Connect good server
      await mcpService.connectServer(goodServer)

      // Try to connect bad server (will fail)
      await mcpService.connectServer(badServer).catch(() => {})

      // Good server should still be connected
      expect(mcpService.isServerConnected('good-server')).toBe(true)
      expect(mcpService.isServerConnected('bad-server')).toBe(false)

      // Good server's tools should still be available
      const tools = mcpService.getAllTools()
      expect(tools.length).toBeGreaterThan(0)
    })
  })
})
