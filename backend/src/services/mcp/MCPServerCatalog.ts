/**
 * MCP Server Catalog
 *
 * Pre-populated catalog of known MCP servers for air-gap environments.
 * This provides discovery without requiring external registries.
 */

export interface MCPServerTemplate {
  id: string
  name: string
  description: string
  category: 'filesystem' | 'database' | 'api' | 'productivity' | 'development' | 'custom'
  type: 'stdio' | 'http'

  // For stdio servers
  stdio?: {
    command: string
    args: string[]
    description: string
    requiresNpx?: boolean
    packageName?: string  // npm package name if using npx
  }

  // For HTTP servers
  http?: {
    defaultUrl: string
    requiresAuth?: boolean
    description: string
  }

  // Configuration hints
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

  // Example tools this server provides
  exampleTools?: Array<{
    name: string
    description: string
  }>

  // Installation instructions for air-gap
  airgapInstructions?: string
}

/**
 * Built-in catalog of known MCP servers
 * This can be imported/exported for sharing across air-gap systems
 */
export const MCP_SERVER_CATALOG: MCPServerTemplate[] = [
  {
    id: 'filesystem',
    name: 'Filesystem Server',
    description: 'Read and write files on the local filesystem',
    category: 'filesystem',
    type: 'stdio',
    stdio: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/directory'],
      description: 'Official MCP filesystem server',
      requiresNpx: true,
      packageName: '@modelcontextprotocol/server-filesystem'
    },
    configurationHints: {
      pathParameters: [
        {
          name: 'root_directory',
          description: 'Root directory to allow access to',
          example: '/home/user/documents'
        }
      ]
    },
    exampleTools: [
      { name: 'read_file', description: 'Read contents of a file' },
      { name: 'write_file', description: 'Write contents to a file' },
      { name: 'list_directory', description: 'List files in a directory' },
      { name: 'create_directory', description: 'Create a new directory' },
      { name: 'move_file', description: 'Move or rename a file' },
      { name: 'search_files', description: 'Search for files matching a pattern' }
    ],
    airgapInstructions: 'Package can be pre-installed: npm install -g @modelcontextprotocol/server-filesystem'
  },
  {
    id: 'sqlite',
    name: 'SQLite Database Server',
    description: 'Query and manipulate SQLite databases',
    category: 'database',
    type: 'stdio',
    stdio: {
      command: 'npx',
      args: ['-y', 'mcp-server-sqlite-npx', '/path/to/database.db'],
      description: 'MCP SQLite server',
      requiresNpx: true,
      packageName: 'mcp-server-sqlite-npx'
    },
    configurationHints: {
      pathParameters: [
        {
          name: 'database_path',
          description: 'Path to SQLite database file',
          example: '/data/myapp.db'
        }
      ]
    },
    exampleTools: [
      { name: 'query', description: 'Execute SQL SELECT queries' },
      { name: 'execute', description: 'Execute SQL INSERT/UPDATE/DELETE' },
      { name: 'list_tables', description: 'List all tables in database' },
      { name: 'describe_table', description: 'Get schema for a table' }
    ],
    airgapInstructions: 'Package can be pre-installed: npm install -g mcp-server-sqlite-npx'
  },
  {
    id: 'postgres',
    name: 'PostgreSQL Server',
    description: 'Query and manipulate PostgreSQL databases',
    category: 'database',
    type: 'stdio',
    stdio: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/dbname'],
      description: 'Official MCP PostgreSQL server',
      requiresNpx: true,
      packageName: '@modelcontextprotocol/server-postgres'
    },
    configurationHints: {
      envVars: [
        {
          name: 'DATABASE_URL',
          description: 'PostgreSQL connection string',
          required: true
        }
      ]
    },
    exampleTools: [
      { name: 'query', description: 'Execute SQL queries' },
      { name: 'list_tables', description: 'List all tables' },
      { name: 'describe_table', description: 'Get table schema' }
    ],
    airgapInstructions: 'Package can be pre-installed: npm install -g @modelcontextprotocol/server-postgres'
  },
  {
    id: 'fetch',
    name: 'HTTP Fetch Server',
    description: 'Make HTTP requests to external APIs',
    category: 'api',
    type: 'stdio',
    stdio: {
      command: 'npx',
      args: ['-y', '@smithery/mcp-fetch'],
      description: 'MCP HTTP fetch server',
      requiresNpx: true,
      packageName: '@smithery/mcp-fetch'
    },
    exampleTools: [
      { name: 'fetch', description: 'Make HTTP GET/POST/PUT/DELETE requests' }
    ],
    airgapInstructions: 'Package can be pre-installed: npm install -g @smithery/mcp-fetch'
  },
  {
    id: 'git',
    name: 'Git Repository Server',
    description: 'Interact with Git repositories',
    category: 'development',
    type: 'stdio',
    stdio: {
      command: 'npx',
      args: ['-y', 'mcp-git', '/path/to/repo'],
      description: 'MCP Git server',
      requiresNpx: true,
      packageName: 'mcp-git'
    },
    configurationHints: {
      pathParameters: [
        {
          name: 'repository_path',
          description: 'Path to Git repository',
          example: '/home/user/projects/myrepo'
        }
      ]
    },
    exampleTools: [
      { name: 'git_status', description: 'Get repository status' },
      { name: 'git_diff', description: 'View changes' },
      { name: 'git_log', description: 'View commit history' },
      { name: 'git_commit', description: 'Create commits' }
    ],
    airgapInstructions: 'Package can be pre-installed: npm install -g mcp-git'
  },
  {
    id: 'garmin',
    name: 'Garmin Health Data Server',
    description: 'Access Garmin health and fitness data',
    category: 'productivity',
    type: 'stdio',
    stdio: {
      command: 'node',
      args: ['/path/to/garmin-mcp-server/build/index.js'],
      description: 'Custom Garmin health data MCP server',
      requiresNpx: false
    },
    configurationHints: {
      envVars: [
        {
          name: 'GARMIN_CONSUMER_KEY',
          description: 'Garmin API consumer key',
          required: true
        },
        {
          name: 'GARMIN_CONSUMER_SECRET',
          description: 'Garmin API consumer secret',
          required: true
        }
      ]
    },
    exampleTools: [
      { name: 'get_daily_summary', description: 'Get daily activity summary' },
      { name: 'get_heart_rate', description: 'Get heart rate data' },
      { name: 'get_steps', description: 'Get step count data' },
      { name: 'get_sleep', description: 'Get sleep data' }
    ],
    airgapInstructions: 'Custom server - bundle and deploy the entire garmin-mcp-server directory'
  },
  {
    id: 'custom-http',
    name: 'Custom HTTP/SSE Server',
    description: 'Connect to a custom MCP server via HTTP',
    category: 'custom',
    type: 'http',
    http: {
      defaultUrl: 'http://localhost:8080/mcp',
      requiresAuth: false,
      description: 'Custom HTTP-based MCP server'
    },
    configurationHints: {
      envVars: [
        {
          name: 'CUSTOM_API_KEY',
          description: 'Optional API key for authentication',
          required: false
        }
      ]
    },
    exampleTools: [],
    airgapInstructions: 'Deploy your custom MCP server and configure the URL'
  }
]

/**
 * Get server template by ID
 */
export function getServerTemplate(id: string): MCPServerTemplate | undefined {
  return MCP_SERVER_CATALOG.find(s => s.id === id)
}

/**
 * Get servers by category
 */
export function getServersByCategory(category: MCPServerTemplate['category']): MCPServerTemplate[] {
  return MCP_SERVER_CATALOG.filter(s => s.category === category)
}

/**
 * Search servers by keyword
 */
export function searchServers(keyword: string): MCPServerTemplate[] {
  const lowerKeyword = keyword.toLowerCase()
  return MCP_SERVER_CATALOG.filter(s =>
    s.name.toLowerCase().includes(lowerKeyword) ||
    s.description.toLowerCase().includes(lowerKeyword) ||
    s.exampleTools?.some(t =>
      t.name.toLowerCase().includes(lowerKeyword) ||
      t.description.toLowerCase().includes(lowerKeyword)
    )
  )
}

/**
 * Export catalog to JSON for sharing
 */
export function exportCatalog(): string {
  return JSON.stringify(MCP_SERVER_CATALOG, null, 2)
}

/**
 * Import custom server templates
 * Useful for sharing configurations across air-gap systems
 */
export function importServerTemplates(json: string): MCPServerTemplate[] {
  try {
    const templates = JSON.parse(json)
    return Array.isArray(templates) ? templates : []
  } catch (error) {
    throw new Error('Invalid JSON format for server templates')
  }
}
