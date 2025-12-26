import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { TestLLMServer } from '../helpers/TestLLMServer.js'
import { LLMService } from '../../services/llm/LLMService.js'
import { ChatAPI } from '../../api/chat.js'
import { Request, Response } from 'express'
import { EventEmitter } from 'events'

class MockResponse extends EventEmitter {
  public statusCode: number = 200
  private _headers: Record<string, string> = {}
  private chunks: string[] = []
  public ended: boolean = false

  status(code: number) {
    this.statusCode = code
    return this
  }

  setHeader(name: string, value: string | string[] | number): this {
    this._headers[name.toLowerCase()] = String(value)
    return this
  }

  getHeader(name: string): string | undefined {
    return this._headers[name.toLowerCase()]
  }

  // For debugging - expose internal headers
  get _internalHeaders() {
    return this._headers
  }

  get headers(): Record<string, string> {
    return this._headers
  }

  write(data: string) {
    this.chunks.push(data)
    this.emit('data', data)
    return true
  }

  end() {
    this.ended = true
    this.emit('end')
  }

  json(data: any) {
    this.chunks.push(JSON.stringify(data))
    this.end()
    return this
  }

  get headersSent() {
    return Object.keys(this._headers).length > 0
  }

  getData(): string {
    return this.chunks.join('')
  }
}

// Mock MCP Service for testing
class MockMCPService {
  getAllTools() {
    return []
  }
}

describe('Chat Integration Tests', () => {
  let testLLMServer: TestLLMServer
  let llmService: LLMService
  let mockMCPService: any
  let chatAPI: ChatAPI

  beforeAll(async () => {
    testLLMServer = new TestLLMServer()
    const url = await testLLMServer.start()

    llmService = new LLMService({
      baseURL: url,
      apiKey: 'test-key',
      model: 'test-model'
    })

    mockMCPService = new MockMCPService()
    chatAPI = new ChatAPI(llmService, mockMCPService)
  })

  afterAll(async () => {
    await testLLMServer.stop()
  })

  describe('POST /api/chat', () => {
    it('should stream chat response', async () => {
      testLLMServer.setDefaultResponse({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello there how are you'
            },
            finish_reason: 'stop'
          }
        ]
      })

      const req = {
        body: {
          messages: [{ role: 'user', content: 'Hello', timestamp: Date.now() }]
        }
      } as Request

      const res = new MockResponse() as unknown as Response

      const chunks: any[] = []
      res.on('data', (data: string) => {
        if (data.startsWith('data: ') && !data.includes('[DONE]')) {
          const jsonStr = data.replace('data: ', '').trim()
          chunks.push(JSON.parse(jsonStr))
        }
      })

      await new Promise<void>((resolve) => {
        res.on('end', resolve)
        chatAPI.chat(req, res, (() => {}) as any)
      })

      expect((res as any).getHeader('content-type')).toBe('text/event-stream')
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.some(c => c.type === 'content')).toBe(true)
    })

    it('should return error when LLM not configured', async () => {
      const unconfiguredService = new LLMService()
      const unconfiguredAPI = new ChatAPI(unconfiguredService, mockMCPService)

      const req = {
        body: {
          messages: [{ role: 'user', content: 'Hello', timestamp: Date.now() }]
        }
      } as Request

      const res = new MockResponse() as unknown as Response

      await new Promise<void>((resolve) => {
        res.on('end', resolve)
        unconfiguredAPI.chat(req, res, (() => {}) as any)
      })

      expect(res.statusCode).toBe(503)
      const data = JSON.parse((res as any).getData())
      expect(data.error).toContain('not configured')
    })

    it('should validate request body', async () => {
      const req = {
        body: {
          messages: 'invalid'
        }
      } as Request

      const res = new MockResponse() as unknown as Response

      await new Promise<void>((resolve) => {
        res.on('end', resolve)
        chatAPI.chat(req, res, (() => {}) as any)
      })

      expect(res.statusCode).toBe(400)
      const data = JSON.parse((res as any).getData())
      expect(data.error).toBe('Invalid request')
    })

    it('should handle LLM errors gracefully', async () => {
      // Create service with unreachable endpoint
      const badService = new LLMService({
        baseURL: 'http://localhost:9999/v1',
        model: 'test'
      })
      const badAPI = new ChatAPI(badService, mockMCPService)

      const req = {
        body: {
          messages: [{ role: 'user', content: 'Hello', timestamp: Date.now() }]
        }
      } as Request

      const res = new MockResponse() as unknown as Response

      const errorChunks: any[] = []
      res.on('data', (data: string) => {
        if (data.startsWith('data: ')) {
          const jsonStr = data.replace('data: ', '').trim()
          try {
            const parsed = JSON.parse(jsonStr)
            if (parsed.type === 'error') {
              errorChunks.push(parsed)
            }
          } catch (e) {
            // Ignore parse errors for [DONE]
          }
        }
      })

      await new Promise<void>((resolve) => {
        res.on('end', resolve)
        badAPI.chat(req, res, (() => {}) as any)
      })

      expect(errorChunks.length).toBeGreaterThan(0)
      expect(errorChunks[0].error).toMatch(/Connection error|Cannot reach LLM endpoint/)
    })
  })
})
