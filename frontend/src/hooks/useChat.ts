import { useState, useCallback } from 'react'
import { apiClient } from '../services/api'
import type { Message } from '../../../shared/types'

export function useChat() {
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
      // Add system message to ensure English responses and set context
      const systemMessage: Message = {
        role: 'system',
        content: 'You are an MCP (Model Context Protocol) chatbot assistant with access to Garmin health data and other system tools. Always respond in English, regardless of the language used in the user\'s message.\n\nIMPORTANT INSTRUCTIONS:\n1. When users ask for time-based data (e.g., "last 7 days", "this week"), automatically calculate the dates. Today\'s date is ' + new Date().toISOString().split('T')[0] + '. Calculate date ranges yourself - do not ask users for dates.\n2. Proactively use available MCP tools to fetch data when requested.\n3. CRITICAL: When you receive data from tools, provide ONLY a brief 2-3 sentence summary. DO NOT CREATE:\n   - Markdown tables\n   - Bullet point lists of data\n   - ASCII charts\n   - Detailed breakdowns\n   The UI automatically renders beautiful interactive charts from the raw data. Your job is to briefly interpret the data, not display it.\n4. Example good response: "You walked 70,074 steps over the last 7 days, averaging 10,010 steps per day. You met your goal on 5 out of 6 days, with your best day being December 18th at 15,613 steps."\n5. Be helpful and action-oriented - fetch data immediately rather than asking for clarification unless truly necessary.',
        timestamp: 0 // System message always at timestamp 0
      }

      const stream = apiClient.chatStream([systemMessage, ...messages, userMessage])

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
  }, [messages])

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
