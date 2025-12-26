import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../services/api'
import './ToolDiscoveryPanel.css'

interface MCPServerTemplate {
  id: string
  name: string
  description: string
  category: string
  type: 'stdio' | 'http'
  stdio?: {
    command: string
    args: string[]
    description: string
    packageName?: string
  }
  http?: {
    defaultUrl: string
    requiresAuth?: boolean
  }
  configurationHints?: {
    envVars?: Array<{
      name: string
      description: string
      required: boolean
    }>
    pathParameters?: Array<{
      name: string
      description: string
      example: string
    }>
  }
  exampleTools?: Array<{
    name: string
    description: string
  }>
  airgapInstructions?: string
}

interface Tool {
  name: string
  description: string
  inputSchema: any
  serverId: string
}

export function ToolDiscoveryPanel() {
  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedServer, setSelectedServer] = useState<MCPServerTemplate | null>(null)
  const [testingTool, setTestingTool] = useState<Tool | null>(null)
  const [testArgs, setTestArgs] = useState<string>('{}')
  const [activeTab, setActiveTab] = useState<'catalog' | 'connected'>('catalog')
  const [configuringServer, setConfiguringServer] = useState<MCPServerTemplate | null>(null)
  const [serverConfig, setServerConfig] = useState<any>({
    name: '',
    enabled: true,
    command: '',
    args: [],
    url: '',
    env: {}
  })

  // Fetch server catalog
  const { data: catalog } = useQuery({
    queryKey: ['discovery', 'catalog'],
    queryFn: async () => {
      const response = await fetch('/api/discovery/catalog')
      return response.json()
    }
  })

  // Fetch connected tools
  const { data: connectedTools, refetch: refetchTools } = useQuery({
    queryKey: ['discovery', 'tools'],
    queryFn: async () => {
      const response = await fetch('/api/discovery/tools')
      return response.json()
    },
    enabled: activeTab === 'connected'
  })

  // Test tool mutation
  const testToolMutation = useMutation({
    mutationFn: async ({ serverId, toolName, args }: { serverId: string, toolName: string, args: any }) => {
      const response = await fetch(`/api/discovery/tools/${serverId}/${toolName}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arguments: args })
      })
      return response.json()
    }
  })

  // Add MCP server mutation
  const addServerMutation = useMutation({
    mutationFn: async (config: any) => {
      const response = await fetch('/api/config/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add server')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      queryClient.invalidateQueries({ queryKey: ['discovery', 'tools'] })
      setConfiguringServer(null)
      setSelectedServer(null)
      alert('MCP server added successfully!')
    },
    onError: (error: Error) => {
      alert(`Failed to add server: ${error.message}`)
    }
  })

  const categories = ['all', 'filesystem', 'database', 'api', 'productivity', 'development', 'custom']

  const filteredServers = catalog?.servers?.filter((server: MCPServerTemplate) => {
    const matchesCategory = selectedCategory === 'all' || server.category === selectedCategory
    const matchesSearch = !searchQuery ||
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  }) || []

  const handleTestTool = async () => {
    if (!testingTool) return

    try {
      const args = JSON.parse(testArgs)
      await testToolMutation.mutateAsync({
        serverId: testingTool.serverId,
        toolName: testingTool.name,
        args
      })
    } catch (error) {
      alert('Invalid JSON in test arguments')
    }
  }

  const handleConfigureServer = (template: MCPServerTemplate) => {
    setConfiguringServer(template)

    // Pre-fill form based on template
    if (template.type === 'stdio' && template.stdio) {
      setServerConfig({
        name: template.name,
        enabled: true,
        type: 'stdio',
        command: template.stdio.command,
        args: template.stdio.args.join(' '), // Convert array to string for editing
        env: {}
      })
    } else if (template.type === 'http' && template.http) {
      setServerConfig({
        name: template.name,
        enabled: true,
        type: 'http',
        url: template.http.defaultUrl,
        headers: {}
      })
    }
  }

  const handleAddServer = async () => {
    if (!configuringServer) return

    try {
      // Build the server config
      const config: any = {
        name: serverConfig.name || configuringServer.name,
        enabled: serverConfig.enabled,
        type: configuringServer.type
      }

      if (configuringServer.type === 'stdio') {
        // Parse args string into array
        const argsArray = serverConfig.args
          .split(' ')
          .filter((arg: string) => arg.trim())
          .map((arg: string) => arg.trim())

        config.config = {
          command: serverConfig.command,
          args: argsArray,
          env: serverConfig.env || {}
        }
      } else if (configuringServer.type === 'http') {
        config.config = {
          url: serverConfig.url,
          headers: serverConfig.headers || {}
        }
      }

      await addServerMutation.mutateAsync(config)
    } catch (error) {
      console.error('Error adding server:', error)
    }
  }

  return (
    <div className="tool-discovery-panel">
      <div className="discovery-header">
        <h2>🔍 Tool Discovery</h2>
        <p>Discover and test MCP servers and tools in your air-gap environment</p>
      </div>

      <div className="discovery-tabs">
        <button
          className={activeTab === 'catalog' ? 'active' : ''}
          onClick={() => setActiveTab('catalog')}
        >
          📚 Server Catalog ({catalog?.count || 0})
        </button>
        <button
          className={activeTab === 'connected' ? 'active' : ''}
          onClick={() => setActiveTab('connected')}
        >
          🔗 Connected Tools ({connectedTools?.totalTools || 0})
        </button>
      </div>

      {activeTab === 'catalog' && (
        <div className="catalog-view">
          <div className="discovery-controls">
            <input
              type="text"
              placeholder="Search servers or tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />

            <div className="category-filters">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={selectedCategory === cat ? 'active' : ''}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="server-grid">
            {filteredServers.map((server: MCPServerTemplate) => (
              <div
                key={server.id}
                className="server-card"
                onClick={() => setSelectedServer(server)}
              >
                <div className="server-header">
                  <h3>{server.name}</h3>
                  <span className={`badge badge-${server.type}`}>{server.type}</span>
                </div>
                <p className="server-description">{server.description}</p>
                <div className="server-category">{server.category}</div>
                {server.exampleTools && (
                  <div className="example-tools">
                    <strong>{server.exampleTools.length} tools</strong>
                    <ul>
                      {server.exampleTools.slice(0, 3).map((tool, idx) => (
                        <li key={idx}>{tool.name}</li>
                      ))}
                      {server.exampleTools.length > 3 && <li>+{server.exampleTools.length - 3} more...</li>}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          {selectedServer && (
            <div className="server-detail-modal" onClick={() => setSelectedServer(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="close-button" onClick={() => setSelectedServer(null)}>×</button>

                <h2>{selectedServer.name}</h2>
                <p>{selectedServer.description}</p>

                <div className="detail-section">
                  <h3>Type</h3>
                  <span className={`badge badge-${selectedServer.type}`}>{selectedServer.type}</span>
                </div>

                {selectedServer.stdio && (
                  <div className="detail-section">
                    <h3>Command</h3>
                    <pre>{selectedServer.stdio.command} {selectedServer.stdio.args.join(' ')}</pre>
                    {selectedServer.stdio.packageName && (
                      <p className="hint">Package: <code>{selectedServer.stdio.packageName}</code></p>
                    )}
                  </div>
                )}

                {selectedServer.http && (
                  <div className="detail-section">
                    <h3>HTTP Configuration</h3>
                    <p>URL: <code>{selectedServer.http.defaultUrl}</code></p>
                    {selectedServer.http.requiresAuth && (
                      <p className="hint">⚠️ Requires authentication</p>
                    )}
                  </div>
                )}

                {selectedServer.exampleTools && selectedServer.exampleTools.length > 0 && (
                  <div className="detail-section">
                    <h3>Available Tools</h3>
                    <ul className="tool-list">
                      {selectedServer.exampleTools.map((tool, idx) => (
                        <li key={idx}>
                          <strong>{tool.name}</strong> - {tool.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedServer.airgapInstructions && (
                  <div className="detail-section">
                    <h3>Air-Gap Deployment</h3>
                    <div className="airgap-instructions">
                      {selectedServer.airgapInstructions}
                    </div>
                  </div>
                )}

                <div className="modal-actions">
                  <button onClick={() => {
                    // Copy configuration to clipboard
                    const config = selectedServer.stdio
                      ? `Command: ${selectedServer.stdio.command}\nArgs: ${selectedServer.stdio.args.join(' ')}`
                      : `URL: ${selectedServer.http?.defaultUrl}`
                    navigator.clipboard.writeText(config)
                    alert('Configuration copied to clipboard!')
                  }}>
                    📋 Copy Configuration
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => {
                      handleConfigureServer(selectedServer)
                      setSelectedServer(null)
                    }}
                  >
                    ➕ Configure & Add Server
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'connected' && (
        <div className="connected-view">
          {connectedTools && connectedTools.totalTools > 0 ? (
            <>
              <div className="connected-stats">
                <div className="stat">
                  <strong>{connectedTools.connectedServers}</strong>
                  <span>Connected Servers</span>
                </div>
                <div className="stat">
                  <strong>{connectedTools.totalTools}</strong>
                  <span>Available Tools</span>
                </div>
              </div>

              <div className="tools-by-server">
                {Object.entries(connectedTools.toolsByServer || {}).map(([serverId, tools]: [string, any]) => (
                  <div key={serverId} className="server-tools-section">
                    <h3>📦 {serverId}</h3>
                    <div className="tool-cards">
                      {tools.map((tool: any) => (
                        <div key={tool.name} className="tool-card">
                          <div className="tool-header">
                            <h4>{tool.name}</h4>
                            <button
                              onClick={() => {
                                setTestingTool({ ...tool, serverId })
                                setTestArgs(JSON.stringify(tool.inputSchema?.properties || {}, null, 2))
                              }}
                              className="test-button"
                            >
                              🧪 Test
                            </button>
                          </div>
                          <p>{tool.description}</p>
                          {tool.inputSchema && (
                            <details className="schema-details">
                              <summary>View Schema</summary>
                              <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>No MCP servers connected yet.</p>
              <p>Configure servers in Settings to see available tools here.</p>
            </div>
          )}

          {testingTool && (
            <div className="tool-test-modal" onClick={() => setTestingTool(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="close-button" onClick={() => setTestingTool(null)}>×</button>

                <h2>🧪 Test Tool: {testingTool.name}</h2>
                <p>{testingTool.description}</p>

                <div className="test-form">
                  <label>Arguments (JSON)</label>
                  <textarea
                    value={testArgs}
                    onChange={(e) => setTestArgs(e.target.value)}
                    rows={10}
                    className="json-editor"
                  />

                  <button onClick={handleTestTool} disabled={testToolMutation.isPending}>
                    {testToolMutation.isPending ? 'Testing...' : 'Execute Test'}
                  </button>
                </div>

                {testToolMutation.data && (
                  <div className={`test-result ${testToolMutation.data.success ? 'success' : 'error'}`}>
                    <h3>Result:</h3>
                    <pre>{JSON.stringify(testToolMutation.data, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {configuringServer && (
        <div className="server-detail-modal" onClick={() => setConfiguringServer(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setConfiguringServer(null)}>×</button>

            <h2>➕ Configure {configuringServer.name}</h2>
            <p>{configuringServer.description}</p>

            <div className="config-form">
              <div className="form-group">
                <label>Server Name</label>
                <input
                  type="text"
                  value={serverConfig.name}
                  onChange={(e) => setServerConfig({ ...serverConfig, name: e.target.value })}
                  placeholder="Enter server name"
                />
              </div>

              {configuringServer.type === 'stdio' && configuringServer.stdio && (
                <>
                  <div className="form-group">
                    <label>Command</label>
                    <input
                      type="text"
                      value={serverConfig.command}
                      onChange={(e) => setServerConfig({ ...serverConfig, command: e.target.value })}
                      placeholder="e.g., npx, node, python"
                    />
                  </div>

                  <div className="form-group">
                    <label>Arguments</label>
                    <input
                      type="text"
                      value={serverConfig.args}
                      onChange={(e) => setServerConfig({ ...serverConfig, args: e.target.value })}
                      placeholder="Space-separated arguments"
                    />
                    {configuringServer.configurationHints?.pathParameters && (
                      <div className="hint">
                        <strong>Customize paths:</strong>
                        <ul>
                          {configuringServer.configurationHints.pathParameters.map((param, idx) => (
                            <li key={idx}>
                              <strong>{param.name}:</strong> {param.description}
                              {param.example && <code> (e.g., {param.example})</code>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}

              {configuringServer.type === 'http' && configuringServer.http && (
                <>
                  <div className="form-group">
                    <label>URL</label>
                    <input
                      type="text"
                      value={serverConfig.url}
                      onChange={(e) => setServerConfig({ ...serverConfig, url: e.target.value })}
                      placeholder="http://localhost:8080/mcp"
                    />
                  </div>
                </>
              )}

              {configuringServer.configurationHints?.envVars && (
                <div className="form-group">
                  <label>Environment Variables (Optional)</label>
                  <div className="hint">
                    <strong>This server may require:</strong>
                    <ul>
                      {configuringServer.configurationHints.envVars.map((envVar, idx) => (
                        <li key={idx}>
                          <strong>{envVar.name}</strong>{envVar.required && ' (required)'}: {envVar.description}
                        </li>
                      ))}
                    </ul>
                    <p>Set these in your system environment or container config.</p>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={serverConfig.enabled}
                    onChange={(e) => setServerConfig({ ...serverConfig, enabled: e.target.checked })}
                  />
                  <span>Enable server immediately after adding</span>
                </label>
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={() => setConfiguringServer(null)}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={handleAddServer}
                disabled={addServerMutation.isPending}
              >
                {addServerMutation.isPending ? 'Adding...' : '➕ Add Server'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
