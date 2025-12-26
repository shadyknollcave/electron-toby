import { useState, useCallback } from 'react'
import { apiClient } from '../services/api'
import { useConfig } from './useConfig'
import type { Message } from '../../../shared/types'

// Default system prompt used if no custom prompt is configured
const DEFAULT_SYSTEM_PROMPT = `You are an MCP (Model Context Protocol) development assistant that helps developers build, test, and troubleshoot MCP servers. You have access to connected MCP tools and can call them to demonstrate functionality, verify implementations, and help debug issues. Always respond in English.

YOUR PRIMARY ROLE:
- Help developers test and validate their MCP server implementations
- Troubleshoot connection issues, tool execution errors, and schema problems
- Demonstrate how to use MCP tools with concrete examples
- Provide guidance on MCP server development best practices
- Test tool functionality by actually calling the tools when requested

IMPORTANT INSTRUCTIONS:
1. When users ask you to test or call a tool, DO IT IMMEDIATELY - don't just explain how it works, actually execute it.
2. Proactively use available MCP tools to verify they work correctly when troubleshooting.
3. When you receive data from tools, provide a brief summary (2-3 sentences) interpreting the results. Focus on whether the tool worked correctly and what the data shows. The UI may render charts automatically.
4. If a tool call fails, analyze the error message and suggest specific fixes (e.g., check arguments, verify server connection, review input schema).
5. When discussing MCP concepts, be practical and example-driven - show working code and actual tool calls rather than abstract explanations.`

export function useChat() {
  const { config } = useConfig()
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(async (content: string) => {
    setError(null)
    setIsStreaming(true)

    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMessage])

    let assistantMessage: Message = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      chartData: []
    }

    try {
      // Calculate timezone information for consistent date handling
      const now = new Date()
      const utcDate = now.toISOString().split('T')[0]
      const timezoneOffset = -now.getTimezoneOffset() / 60
      const offsetStr = timezoneOffset >= 0 ? `+${timezoneOffset}` : `${timezoneOffset}`
      const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone

      // Use custom system prompt from config, or fall back to default
      const basePrompt = config?.llm?.systemPrompt || DEFAULT_SYSTEM_PROMPT

      // Always append time and date context
      const timeContext = `

TIME AND DATE CONTEXT:
- Current UTC time: ${now.toISOString()}
- User timezone: UTC${offsetStr} (${timezoneName})
- User local date: ${utcDate}
- When users say "today", use their local date: ${utcDate}
- When calling MCP tools with date parameters, use YYYY-MM-DD format in user's timezone`

      // Add system message to ensure English responses and set context
      const systemMessage: Message = {
        role: 'system',
        content: basePrompt + timeContext,
        timestamp: 0 // System message always at timestamp 0
      }

      // Only include system message on first conversation turn to avoid exponential message history growth
      const conversationMessages = messages.length === 0
        ? [systemMessage, userMessage]
        : [...messages, userMessage]

      const stream = apiClient.chatStream(conversationMessages)

      for await (const chunk of stream) {
        if (chunk.type === 'content' && chunk.content) {
          assistantMessage.content += chunk.content
          setMessages(prev => {
            const newMessages = [...prev]
            if (newMessages[newMessages.length - 1]?.role === 'assistant') {
              newMessages[newMessages.length - 1] = { ...assistantMessage }
            } else {
              newMessages.push({ ...assistantMessage })
            }
            return newMessages
          })
        } else if (chunk.type === 'chart_data' && chunk.chartData) {
          if (!assistantMessage.chartData) {
            assistantMessage.chartData = []
          }
          assistantMessage.chartData.push(chunk.chartData)

          // Update UI immediately
          setMessages(prev => {
            const newMessages = [...prev]
            if (newMessages[newMessages.length - 1]?.role === 'assistant') {
              newMessages[newMessages.length - 1] = { ...assistantMessage }
            } else {
              newMessages.push({ ...assistantMessage })
            }
            return newMessages
          })
        } else if (chunk.type === 'error') {
          setError(chunk.error || 'An error occurred')
          break
        }
      }
    } catch (err: any) {
      setError(err.message)
      setMessages(prev => prev.filter(m => m !== userMessage))
    } finally {
      setIsStreaming(false)
    }
  }, [messages, config])

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    clearMessages
  }
}
