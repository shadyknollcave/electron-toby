import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { LLMService } from './LLMService.js'
import { TestLLMServer } from '../../tests/helpers/TestLLMServer.js'
import type { Message, LLMConfig } from '../../../../shared/types/index.js'

describe('LLMService', () => {
  let testServer: TestLLMServer
  let llmService: LLMService
  let config: LLMConfig

  beforeAll(async () => {
    testServer = new TestLLMServer()
    const url = await testServer.start()

    config = {
      baseURL: url,
      apiKey: 'test-key',
      model: 'test-model'
    }
  })

  afterAll(async () => {
    await testServer.stop()
  })

  beforeEach(() => {
    testServer.clearRequests()
    llmService = new LLMService(config)
  })

  describe('configuration', () => {
    it('should accept configuration in constructor', () => {
      expect(llmService.isConfigured()).toBe(true)
    })

    it('should allow reconfiguration', () => {
      const newService = new LLMService()
      expect(newService.isConfigured()).toBe(false)

      newService.configure(config)
      expect(newService.isConfigured()).toBe(true)
    })
  })

  describe('healthCheck', () => {
    it('should return true when LLM is reachable', async () => {
      const healthy = await llmService.healthCheck()
      expect(healthy).toBe(true)
    })

    it('should return false when not configured', async () => {
      const unconfiguredService = new LLMService()
      const healthy = await unconfiguredService.healthCheck()
      expect(healthy).toBe(false)
    })

    it('should return false when endpoint is unreachable', async () => {
      const badService = new LLMService({
        baseURL: 'http://localhost:9999/v1',
        model: 'test'
      })
      const healthy = await badService.healthCheck()
      expect(healthy).toBe(false)
    })
  })

  describe('chat', () => {
    it('should send messages and receive response', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello, how are you?' }
      ]

      testServer.setDefaultResponse({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'I am doing well, thank you!'
            },
            finish_reason: 'stop'
          }
        ]
      })

      const response = await llmService.chat(messages)

      expect(response.message.role).toBe('assistant')
      expect(response.message.content).toBe('I am doing well, thank you!')
      expect(response.finishReason).toBe('stop')

      const lastRequest = testServer.getLastRequest()
      expect(lastRequest?.messages).toHaveLength(1)
      expect(lastRequest?.messages[0].content).toBe('Hello, how are you?')
    })

    it('should include tools when provided', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'What is 2+2?' }
      ]

      const tools = [
        {
          name: 'calculate',
          description: 'Perform calculations',
          inputSchema: {
            type: 'object',
            properties: {
              expression: { type: 'string' }
            }
          },
          serverId: 'test-server'
        }
      ]

      await llmService.chat(messages, tools)

      const lastRequest = testServer.getLastRequest()
      expect(lastRequest?.tools).toHaveLength(1)
      expect(lastRequest?.tools?.[0].function.name).toBe('calculate')
    })

    it('should handle tool calls in response', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'What is 2+2?' }
      ]

      testServer.setDefaultResponse({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'calculate',
                    arguments: '{"expression":"2+2"}'
                  }
                }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ]
      })

      const response = await llmService.chat(messages)

      expect(response.finishReason).toBe('tool_calls')
      expect(response.message.tool_calls).toHaveLength(1)
      expect(response.message.tool_calls?.[0].function.name).toBe('calculate')
    })

    it('should throw error when not configured', async () => {
      const unconfiguredService = new LLMService()
      const messages: Message[] = [{ role: 'user', content: 'Hello' }]

      await expect(unconfiguredService.chat(messages)).rejects.toThrow(
        'LLM service not configured'
      )
    })

    it('should throw descriptive error when endpoint unreachable', async () => {
      const badService = new LLMService({
        baseURL: 'http://localhost:9999/v1',
        model: 'test'
      })
      const messages: Message[] = [{ role: 'user', content: 'Hello' }]

      await expect(badService.chat(messages)).rejects.toThrow(
        /Connection error|Cannot reach LLM endpoint/
      )
    })
  })

  describe('chatStream', () => {
    it('should stream response chunks', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Tell me a story' }
      ]

      testServer.setDefaultResponse({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Once upon a time'
            },
            finish_reason: 'stop'
          }
        ]
      })

      const chunks: string[] = []
      for await (const chunk of llmService.chatStream(messages)) {
        if (chunk.type === 'content' && chunk.content) {
          chunks.push(chunk.content)
        }
      }

      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.join('')).toBe('Once upon a time')
    })
  })
})
