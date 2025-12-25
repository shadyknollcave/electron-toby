export interface ChartData {
  id: string
  type: 'line' | 'bar' | 'area'
  title?: string
  data: Array<Record<string, any>>
  config: {
    xKey: string
    yKeys: string[]
    colors?: string[]
    labels?: Record<string, string>
  }
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  timestamp: number // Required for stable React keys
  chartData?: ChartData[]
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ChatRequest {
  messages: Message[]
}

export interface ChatResponse {
  message: Message
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface StreamChunk {
  type: 'content' | 'tool_call' | 'chart_data' | 'done' | 'error'
  content?: string
  tool_call?: ToolCall
  chartData?: ChartData
  error?: string
}
