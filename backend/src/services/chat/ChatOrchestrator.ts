import { LLMService } from '../llm/LLMService.js'
import { MCPService } from '../mcp/MCPService.js'
import type { Message, ToolCall, ChartData } from '../../../../shared/types/index.js'
import type { MCPTool, MCPToolResult } from '../../../../shared/types/index.js'

const MAX_ITERATIONS = 10
const TOOL_EXECUTION_TIMEOUT = 30000 // 30 seconds

interface ToolCallDelta {
  index: number
  id?: string
  type?: 'function'
  function?: {
    name?: string
    arguments?: string
  }
}

interface AccumulatedResponse {
  assistantMessage: Message
  toolCalls: ToolCall[]
  finishReason: string
}

/**
 * ChatOrchestrator manages the tool execution loop for MCP-enabled conversations.
 *
 * Responsibilities:
 * - Orchestrate multi-turn conversations with tool execution
 * - Accumulate streaming tool call chunks into complete ToolCall objects
 * - Execute tools via MCPService
 * - Build conversation history with tool results
 * - Stream status updates to client
 * - Handle errors gracefully
 */
export class ChatOrchestrator {
  constructor(
    private llmService: LLMService,
    private mcpService: MCPService
  ) {}

  /**
   * Main orchestration loop for chat with tool execution.
   *
   * Flow:
   * 1. Call LLM with current conversation history
   * 2. Stream content to client
   * 3. If LLM requests tool calls:
   *    a. Execute each tool
   *    b. Add results to history
   *    c. Continue loop
   * 4. If LLM gives final answer, stream it and finish
   *
   * @param messages - Conversation history
   * @param tools - Available MCP tools
   * @yields Stream chunks (content, tool_execution_start, tool_execution_result, done, error)
   */
  async *chatWithTools(
    messages: Message[],
    tools: MCPTool[]
  ): AsyncGenerator<{
    type: 'content' | 'tool_execution_start' | 'tool_execution_result' | 'chart_data' | 'done' | 'error'
    content?: string
    toolName?: string
    toolCallId?: string
    isError?: boolean
    error?: string
    chartData?: ChartData
  }> {
    let conversationHistory = [...messages]
    let continueLoop = true
    let iteration = 0

    while (continueLoop && iteration < MAX_ITERATIONS) {
      iteration++

      console.log(`[ChatOrchestrator] Iteration ${iteration}/${MAX_ITERATIONS}`)

      try {
        // Step 1: Call LLM and accumulate response (streams content to client)
        const { assistantMessage, toolCalls, finishReason } =
          yield* this.accumulateStreamingResponse(conversationHistory, tools)

        console.log(`[ChatOrchestrator] LLM finish reason: ${finishReason}, tool calls: ${toolCalls.length}`)

        // Step 2: Check if LLM wants to call tools
        if (finishReason === 'tool_calls' && toolCalls.length > 0) {
          // Add assistant's tool call message to history
          conversationHistory.push(assistantMessage)

          // Step 3: Execute each tool
          for (const toolCall of toolCalls) {
            console.log(`[ChatOrchestrator] Executing tool: ${toolCall.function.name}`)

            yield {
              type: 'tool_execution_start',
              toolName: toolCall.function.name,
              toolCallId: toolCall.id
            }

            try {
              const result = await this.executeToolCallWithTimeout(toolCall, tools)

              // Detect charts in tool result (pass user's last query for context)
              const userQuery = conversationHistory.filter(m => m.role === 'user').slice(-1)[0]?.content || ''
              const detectedCharts = this.detectChartsInToolResult(result, toolCall.function.name, userQuery)

              // Stream chart data chunks
              for (const chart of detectedCharts) {
                yield {
                  type: 'chart_data',
                  chartData: chart
                }
              }

              // Add tool result to history
              const toolResultMessage: Message = {
                role: 'tool',
                content: this.formatToolResult(result),
                tool_call_id: toolCall.id,
                timestamp: Date.now(),
                chartData: detectedCharts.length > 0 ? detectedCharts : undefined
              }
              conversationHistory.push(toolResultMessage)

              console.log(`[ChatOrchestrator] Tool ${toolCall.function.name} succeeded`)

              yield {
                type: 'tool_execution_result',
                toolName: toolCall.function.name,
                toolCallId: toolCall.id,
                isError: result.isError || false
              }
            } catch (error: any) {
              console.error(`[ChatOrchestrator] Tool ${toolCall.function.name} failed:`, error.message)

              // Add error result to history so LLM can explain
              const errorMessage: Message = {
                role: 'tool',
                content: `Error executing ${toolCall.function.name}: ${error.message}`,
                tool_call_id: toolCall.id,
                timestamp: Date.now()
              }
              conversationHistory.push(errorMessage)

              yield {
                type: 'tool_execution_result',
                toolName: toolCall.function.name,
                toolCallId: toolCall.id,
                isError: true
              }
            }
          }

          // Step 4: Continue loop - LLM will see tool results
          continueLoop = true
        } else {
          // Step 5: LLM gave final answer
          conversationHistory.push(assistantMessage)
          continueLoop = false
          console.log(`[ChatOrchestrator] Conversation complete`)
        }
      } catch (error: any) {
        console.error(`[ChatOrchestrator] Error in iteration ${iteration}:`, error.message)
        yield {
          type: 'error',
          error: error.message
        }
        break
      }
    }

    // Safety limit reached
    if (iteration >= MAX_ITERATIONS) {
      console.warn(`[ChatOrchestrator] Maximum iterations (${MAX_ITERATIONS}) reached`)
      yield {
        type: 'error',
        error: 'Maximum tool execution iterations reached. Stopping for safety.'
      }
    }

    yield { type: 'done' }
  }

  /**
   * Accumulate streaming LLM response into complete message.
   *
   * Streams content chunks to client immediately.
   * Buffers tool call deltas until complete.
   *
   * @param messages - Current conversation history
   * @param tools - Available tools
   * @returns Complete assistant message with any tool calls
   */
  private async *accumulateStreamingResponse(
    messages: Message[],
    tools: MCPTool[]
  ): AsyncGenerator<any, AccumulatedResponse> {
    let contentBuffer = ''
    let toolCallsBuffer: Map<number, Partial<ToolCall>> = new Map()
    let finishReason = 'stop'

    const stream = this.llmService.chatStream(messages, tools)

    for await (const chunk of stream) {
      // Stream content immediately
      if (chunk.type === 'content' && chunk.content) {
        contentBuffer += chunk.content
        yield { type: 'content', content: chunk.content }
      }

      // Accumulate tool call deltas (don't stream)
      if (chunk.type === 'tool_call' && chunk.tool_call) {
        const deltas: ToolCallDelta[] = Array.isArray(chunk.tool_call)
          ? chunk.tool_call
          : [chunk.tool_call]

        for (const delta of deltas) {
          const existing = toolCallsBuffer.get(delta.index) || {}

          // Merge delta into existing
          if (delta.id) {
            existing.id = delta.id
          }
          if (delta.type) {
            existing.type = delta.type
          }
          if (delta.function?.name) {
            if (!existing.function) existing.function = { name: '', arguments: '' }
            existing.function.name = delta.function.name
          }
          if (delta.function?.arguments) {
            if (!existing.function) existing.function = { name: '', arguments: '' }
            existing.function.arguments = (existing.function.arguments || '') + delta.function.arguments
          }

          toolCallsBuffer.set(delta.index, existing)
        }
        finishReason = 'tool_calls'
      }
    }

    // Convert accumulated tool calls to array
    const toolCalls: ToolCall[] = Array.from(toolCallsBuffer.values())
      .filter(tc => tc.id && tc.function?.name)
      .map(tc => ({
        id: tc.id!,
        type: 'function',
        function: {
          name: tc.function!.name,
          arguments: tc.function!.arguments || '{}'
        }
      }))

    const assistantMessage: Message = {
      role: 'assistant',
      content: contentBuffer,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      timestamp: Date.now()
    }

    return {
      assistantMessage,
      toolCalls,
      finishReason
    }
  }

  /**
   * Execute a tool call with timeout protection.
   *
   * @param toolCall - Tool call to execute
   * @param availableTools - Available tools
   * @returns Tool execution result
   */
  private async executeToolCallWithTimeout(
    toolCall: ToolCall,
    availableTools: MCPTool[]
  ): Promise<MCPToolResult> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tool execution timeout after ${TOOL_EXECUTION_TIMEOUT}ms`)),
        TOOL_EXECUTION_TIMEOUT
      )
    )

    return Promise.race([
      this.executeToolCall(toolCall, availableTools),
      timeoutPromise
    ])
  }

  /**
   * Execute a single tool call.
   *
   * @param toolCall - Tool call from LLM
   * @param availableTools - Available MCP tools
   * @returns Tool execution result
   */
  private async executeToolCall(
    toolCall: ToolCall,
    availableTools: MCPTool[]
  ): Promise<MCPToolResult> {
    const toolName = toolCall.function.name

    // Find tool to get serverId
    const tool = availableTools.find(t => t.name === toolName)
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`)
    }

    // Parse arguments
    let args: Record<string, any>
    try {
      args = JSON.parse(toolCall.function.arguments)
    } catch (error: any) {
      throw new Error(`Invalid tool arguments: ${error.message}`)
    }

    // Log the tool call details for debugging
    console.log(`[ChatOrchestrator] Tool call details:`)
    console.log(`  Tool: ${toolName}`)
    console.log(`  Server: ${tool.serverId}`)
    console.log(`  Arguments: ${JSON.stringify(args, null, 2)}`)

    // Execute via MCPService
    const result = await this.mcpService.executeTool(
      tool.serverId,
      toolName,
      args
    )

    // Log the result for debugging
    console.log(`[ChatOrchestrator] Tool result:`)
    console.log(`  isError: ${result.isError}`)
    console.log(`  content length: ${result.content.length}`)
    if (result.content.length > 0) {
      console.log(`  content[0]: ${JSON.stringify(result.content[0], null, 2)}`)
    }

    return result
  }

  /**
   * Format MCPToolResult (structured content array) to string for LLM.
   *
   * @param result - Tool execution result
   * @returns Formatted string
   */
  private formatToolResult(result: MCPToolResult): string {
    return result.content
      .map(item => {
        if (item.type === 'text' && item.text) {
          return item.text
        }
        if (item.data) {
          return JSON.stringify(item.data, null, 2)
        }
        return ''
      })
      .filter(s => s.length > 0)
      .join('\n\n')
  }

  /**
   * Detect chart-worthy data in tool result.
   *
   * Scans MCPToolResult.content for arrays of objects with numeric values.
   * Returns ChartData metadata for each detected chart.
   *
   * @param result - Tool execution result
   * @param toolName - Name of the tool that produced the result
   * @param userQuery - User's question for context on what metric they want
   * @returns Array of ChartData objects
   */
  private detectChartsInToolResult(result: MCPToolResult, toolName: string, userQuery: string = ''): ChartData[] {
    const charts: ChartData[] = []

    // Only process successful results
    if (result.isError) {
      return charts
    }

    // Debug logging
    console.log(`[ChatOrchestrator] Scanning for charts in tool result from ${toolName}`)
    console.log(`[ChatOrchestrator] Result content items: ${result.content.length}`)
    console.log(`[ChatOrchestrator] First item structure:`, JSON.stringify(result.content[0], null, 2))

    // Scan all content items for data arrays
    for (const item of result.content) {
      // Check for direct data field
      if (item.data && Array.isArray(item.data)) {
        const flattenedData = this.flattenNestedArrayData(item.data)
        const chart = this.analyzeDataForChart(flattenedData, toolName, userQuery)
        if (chart) {
          charts.push(chart)
        }
      }

      // Check nested data fields
      if (item.data && typeof item.data === 'object' && !Array.isArray(item.data)) {
        for (const key of Object.keys(item.data)) {
          const value = (item.data as any)[key]
          if (Array.isArray(value)) {
            const flattenedValue = this.flattenNestedArrayData(value)
            const chart = this.analyzeDataForChart(flattenedValue, toolName, userQuery)
            if (chart) {
              charts.push(chart)
            }
          }
        }
      }

      // NEW: Check for JSON string in text field (common for Garmin/HTTP MCP servers)
      if (item.text && typeof item.text === 'string') {
        try {
          const parsed = JSON.parse(item.text)

          // Check if parsed result is an array
          if (Array.isArray(parsed)) {
            const flattenedParsed = this.flattenNestedArrayData(parsed)
            const chart = this.analyzeDataForChart(flattenedParsed, toolName, userQuery)
            if (chart) {
              charts.push(chart)
            }
          }

          // Check if parsed result is an object with array properties
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            for (const key of Object.keys(parsed)) {
              const value = parsed[key]
              if (Array.isArray(value)) {
                // Check if array items have nested data that needs flattening
                const flattenedValue = this.flattenNestedArrayData(value)
                const chart = this.analyzeDataForChart(flattenedValue, toolName, userQuery)
                if (chart) {
                  charts.push(chart)
                }
              }
            }
          }
        } catch (e) {
          // Not valid JSON or doesn't contain chart data, skip
        }
      }
    }

    return charts
  }

  /**
   * Flatten nested data structures commonly found in API responses.
   *
   * Handles cases like:
   * [{date: "...", stats: {totalSteps: 123}}]
   * => [{date: "...", totalSteps: 123}]
   *
   * @param data - Array of objects that may have nested data
   * @returns Flattened array
   */
  private flattenNestedArrayData(data: any[]): any[] {
    if (!Array.isArray(data) || data.length === 0) {
      return data
    }

    return data.map(item => {
      if (typeof item !== 'object' || item === null) {
        return item
      }

      const flattened: any = {}

      // Copy all top-level fields
      for (const [key, value] of Object.entries(item)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Flatten one level deep for nested objects
          for (const [nestedKey, nestedValue] of Object.entries(value)) {
            // Only flatten primitive values to avoid over-complicating
            if (typeof nestedValue !== 'object' || nestedValue === null) {
              flattened[nestedKey] = nestedValue
            }
          }
        } else {
          // Copy primitive and array values directly
          flattened[key] = value
        }
      }

      return flattened
    })
  }

  /**
   * Select relevant metrics based on user's query and tool name.
   * Only includes metrics that match what the user asked for.
   *
   * @param numericKeys - Filtered numeric field names
   * @param toolName - Tool name for context (e.g., "get_steps_data")
   * @param userQuery - User's question (e.g., "show me my heart rate")
   * @returns Selected metric keys (typically 1-2 fields)
   */
  private selectRelevantMetrics(numericKeys: string[], toolName: string, userQuery: string): string[] {
    // Extract the primary metric from user query or tool name
    const metricPatterns: Record<string, RegExp[]> = {
      'steps': [/steps/i, /walked/i, /walking/i],
      'heart_rate': [/heart.*rate/i, /hr\b/i, /pulse/i, /bpm/i],
      'calories': [/calories/i, /kcal/i, /burned/i],
      'distance': [/distance/i, /miles/i, /kilometers/i, /km\b/i],
      'stress': [/stress/i, /anxiety/i],
      'sleep': [/sleep/i, /asleep/i, /sleeping/i],
      'battery': [/battery/i, /energy/i],
      'floors': [/floors/i, /climbed/i, /stairs/i],
      'spo2': [/spo2/i, /oxygen/i, /o2/i],
      'respiration': [/respiration/i, /breathing/i, /breath/i]
    }

    // Check user query first (higher priority than tool name)
    let requestedMetric: string | null = null

    for (const [metric, patterns] of Object.entries(metricPatterns)) {
      if (patterns.some(pattern => pattern.test(userQuery))) {
        requestedMetric = metric
        console.log(`[ChatOrchestrator] Detected metric from user query: ${metric}`)
        break
      }
    }

    // Fallback to tool name if query doesn't specify
    if (!requestedMetric) {
      for (const [metric, patterns] of Object.entries(metricPatterns)) {
        if (patterns.some(pattern => pattern.test(toolName))) {
          requestedMetric = metric
          break
        }
      }
    }

    // If we identified the requested metric, filter to only those fields
    if (requestedMetric && metricPatterns[requestedMetric]) {
      const patterns = metricPatterns[requestedMetric]
      const matchingKeys = numericKeys.filter(key =>
        patterns.some(pattern => pattern.test(key))
      )

      if (matchingKeys.length > 0) {
        console.log(`[ChatOrchestrator] Selected metric for '${toolName}': ${matchingKeys.slice(0, 2).join(', ')}`)
        // Return up to 2 closely related fields (e.g., totalSteps, dailySteps)
        return matchingKeys.slice(0, 2)
      }
    }

    // Fallback: for generic tools, prioritize the most interesting single metric
    // Look for the primary health metric in priority order
    const singleMetricPriority = [
      /^totalSteps$/i,
      /^restingHeartRate$/i,
      /^heartRate$/i,
      /^averageStressLevel$/i,
      /^totalCalories$/i,
      /^totalDistance/i
    ]

    for (const pattern of singleMetricPriority) {
      const match = numericKeys.find(key => pattern.test(key))
      if (match) {
        console.log(`[ChatOrchestrator] Generic tool, showing primary metric: ${match}`)
        return [match]
      }
    }

    // Last resort: show first available metric
    console.log(`[ChatOrchestrator] Generic tool, showing first metric: ${numericKeys[0]}`)
    return [numericKeys[0]]
  }

  /**
   * Filter numeric fields to exclude IDs and prioritize relevant metrics.
   *
   * @param numericKeys - All numeric field names
   * @param toolName - Tool name for context
   * @returns Filtered and prioritized numeric keys
   */
  private filterChartableNumericFields(numericKeys: string[], toolName: string): string[] {
    // Fields to exclude (IDs, internal fields, etc.)
    const excludePatterns = [
      /Id$/i,                    // userProfileId, summaryId, etc.
      /^id$/i,                   // id field
      /profile/i,                // profile-related IDs
      /duration.*milliseconds/i, // millisecond durations
      /version/i,                // version numbers
      /goal/i,                   // goal fields (not actual values)
      /constant/i                // boolean-like constants
    ]

    // Priority patterns (ranked by relevance)
    const priorityPatterns = [
      /steps/i,                  // totalSteps, steps
      /calories/i,               // totalCalories, activeCalories
      /heart.*rate/i,            // heartRate, restingHeartRate
      /distance/i,               // totalDistance, distance
      /stress/i,                 // stressLevel, averageStress
      /battery/i,                // bodyBattery
      /spo2/i,                   // oxygen saturation
      /respiration/i,            // breathing rate
      /sleep/i,                  // sleep metrics
      /floors/i,                 // floors climbed
      /active.*seconds/i         // activity time
    ]

    // Filter out excluded fields
    const filtered = numericKeys.filter(key => {
      return !excludePatterns.some(pattern => pattern.test(key))
    })

    // Sort by priority (matching patterns first, then alphabetically)
    const sorted = filtered.sort((a, b) => {
      const aPriority = priorityPatterns.findIndex(p => p.test(a))
      const bPriority = priorityPatterns.findIndex(p => p.test(b))

      if (aPriority !== -1 && bPriority !== -1) {
        return aPriority - bPriority
      }
      if (aPriority !== -1) return -1
      if (bPriority !== -1) return 1
      return a.localeCompare(b)
    })

    console.log(`[ChatOrchestrator] Filtered numeric fields: ${sorted.slice(0, 5).join(', ')}`)

    return sorted
  }

  /**
   * Analyze data array for chart suitability.
   *
   * Requirements:
   * - At least 2 data points
   * - Consistent keys across objects
   * - At least 1 numeric field
   * - At least 1 string/date field (for X-axis)
   *
   * @param data - Array of objects
   * @param toolName - Tool name for chart title
   * @param userQuery - User's question for context
   * @returns ChartData or null if not chart-worthy
   */
  private analyzeDataForChart(data: any[], toolName: string, userQuery: string = ''): ChartData | null {
    // Require at least 2 data points
    if (!data || data.length < 2) {
      return null
    }

    // Check if all items are objects
    if (!data.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
      return null
    }

    // Get keys from first object
    const firstItem = data[0]
    const keys = Object.keys(firstItem)

    if (keys.length < 2) {
      return null
    }

    // Find numeric keys (Y-axis candidates)
    const numericKeys = keys.filter(key => {
      return data.every(item => {
        const val = item[key]
        return typeof val === 'number' && !isNaN(val)
      })
    })

    if (numericKeys.length === 0) {
      return null
    }

    // Filter out non-chart-worthy numeric fields (IDs, timestamps, etc.)
    const filteredNumericKeys = this.filterChartableNumericFields(numericKeys, toolName)

    if (filteredNumericKeys.length === 0) {
      return null
    }

    // Find string/date keys (X-axis candidates)
    const stringKeys = keys.filter(key => {
      return data.every(item => {
        const val = item[key]
        return typeof val === 'string' || val instanceof Date
      })
    })

    if (stringKeys.length === 0) {
      return null
    }

    // Select X-axis key (prefer date-like, then first string)
    let xKey = stringKeys[0]
    const datePattern = /date|time|timestamp|day|month|year/i
    const dateKey = stringKeys.find(k => datePattern.test(k))
    if (dateKey) {
      xKey = dateKey
    }

    // Select Y-axis keys based on user query and tool name context
    const yKeys = this.selectRelevantMetrics(filteredNumericKeys, toolName, userQuery)

    // Determine chart type
    const chartType = this.determineChartType(data, xKey, yKeys)

    // Generate chart metadata
    const chart: ChartData = {
      id: `chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: chartType,
      title: this.generateChartTitle(toolName, yKeys),
      data: data,
      config: {
        xKey,
        yKeys,
        colors: this.generateChartColors(yKeys.length),
        labels: this.generateLabels(yKeys)
      }
    }

    console.log(`[ChatOrchestrator] Detected chart: type=${chartType}, xKey=${xKey}, yKeys=${yKeys.join(',')}`)

    return chart
  }

  /**
   * Check if key values are sequential (for X-axis detection).
   *
   * @param data - Data array
   * @param key - Key to check
   * @returns True if values are sequential numbers
   */
  private isSequentialKey(data: any[], key: string): boolean {
    const values = data.map(item => item[key])

    // Check if all values are numbers
    if (!values.every(v => typeof v === 'number')) {
      return false
    }

    // Check if values are roughly sequential
    const sorted = [...values].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      const diff = sorted[i] - sorted[i - 1]
      if (diff <= 0) {
        return false // Not strictly increasing
      }
    }

    return true
  }

  /**
   * Determine appropriate chart type based on data characteristics.
   *
   * Logic:
   * - Date/time X-axis → area chart
   * - Categorical X-axis → bar chart
   * - Numeric X-axis → line chart
   *
   * @param data - Data array
   * @param xKey - X-axis key
   * @param yKeys - Y-axis keys
   * @returns Chart type
   */
  private determineChartType(data: any[], xKey: string, yKeys: string[]): 'line' | 'bar' | 'area' {
    const firstValue = data[0][xKey]

    // Check if X-axis is date-like
    const datePattern = /date|time|timestamp|day|month|year/i
    if (datePattern.test(xKey) || firstValue instanceof Date) {
      return 'area'
    }

    // Check if X-axis is numeric
    if (typeof firstValue === 'number') {
      return 'line'
    }

    // Default to bar for categorical data
    return 'bar'
  }

  /**
   * Generate human-readable chart title.
   *
   * @param toolName - Tool name
   * @param yKeys - Y-axis keys
   * @returns Chart title
   */
  private generateChartTitle(toolName: string, yKeys: string[]): string {
    // Convert tool name to title case
    const toolTitle = toolName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())

    // Format metric names
    const metrics = yKeys
      .map(key => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
      .join(', ')

    return `${metrics} - ${toolTitle}`
  }

  /**
   * Generate color palette for chart series.
   *
   * @param count - Number of colors needed
   * @returns Array of hex color codes
   */
  private generateChartColors(count: number): string[] {
    const palette = ['#00D9FF', '#7B2CBF', '#39FF14', '#FFD60A', '#FF206E']
    const colors: string[] = []

    for (let i = 0; i < count; i++) {
      colors.push(palette[i % palette.length])
    }

    return colors
  }

  /**
   * Generate human-readable labels for chart legend.
   *
   * @param keys - Data keys
   * @returns Record mapping keys to labels
   */
  private generateLabels(keys: string[]): Record<string, string> {
    const labels: Record<string, string> = {}

    for (const key of keys) {
      // Convert snake_case to Title Case
      labels[key] = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    }

    return labels
  }
}
