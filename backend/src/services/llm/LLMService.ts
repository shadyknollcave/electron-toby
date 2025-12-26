import OpenAI from 'openai'
import { LLMConfig } from '../../../../shared/types/index.js'
import type { Message } from '../../../../shared/types/index.js'
import type { MCPTool } from '../../../../shared/types/index.js'

export interface LLMResponse {
  message: Message
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter'
}

export class LLMService {
  private client: OpenAI | null = null
  private config: LLMConfig | null = null

  constructor(config?: LLMConfig) {
    if (config) {
      this.configure(config)
    }
  }

  configure(config: LLMConfig): void {
    this.config = config
    this.client = new OpenAI({
      apiKey: config.apiKey || 'not-needed',
      baseURL: config.baseURL
    })
  }

  isConfigured(): boolean {
    return this.client !== null && this.config !== null
  }

  async healthCheck(): Promise<boolean> {
    if (!this.client) return false

    try {
      await this.client.models.list()
      return true
    } catch (error) {
      return false
    }
  }

  private transformToOpenAIMessages(messages: Message[]) {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id
    }))
  }

  private transformToOpenAITools(tools?: MCPTool[]) {
    return tools?.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }))
  }

  async chat(
    messages: Message[],
    tools?: MCPTool[]
  ): Promise<LLMResponse> {
    if (!this.client || !this.config) {
      throw new Error('LLM service not configured')
    }

    const openaiMessages = this.transformToOpenAIMessages(messages)
    const openaiTools = this.transformToOpenAITools(tools)

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: openaiMessages as any,
        tools: openaiTools,
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens,
        top_p: this.config.topP,
        presence_penalty: this.config.presencePenalty,
        frequency_penalty: this.config.frequencyPenalty
      })

      const choice = response.choices[0]
      const message: Message = {
        role: 'assistant',
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls as any
      }

      return {
        message,
        finishReason: choice.finish_reason as any
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new Error(
          `Cannot reach LLM endpoint at ${this.config.baseURL}. Is the server running?`
        )
      }
      throw error
    }
  }

  async *chatStream(
    messages: Message[],
    tools?: MCPTool[]
  ): AsyncGenerator<{
    type: 'content' | 'tool_call' | 'done'
    content?: string
    tool_call?: any
  }> {
    if (!this.client || !this.config) {
      throw new Error('LLM service not configured')
    }

    const openaiMessages = this.transformToOpenAIMessages(messages)
    const openaiTools = this.transformToOpenAITools(tools)

    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages: openaiMessages as any,
      tools: openaiTools,
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens,
      top_p: this.config.topP,
      presence_penalty: this.config.presencePenalty,
      frequency_penalty: this.config.frequencyPenalty,
      stream: true
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta

      if (delta?.content) {
        yield { type: 'content', content: delta.content }
      }

      if (delta?.tool_calls) {
        yield { type: 'tool_call', tool_call: delta.tool_calls }
      }

      if (chunk.choices[0]?.finish_reason) {
        yield { type: 'done' }
      }
    }
  }
}
