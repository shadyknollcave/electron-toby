import { useEffect, useRef } from 'react'
import type { Message } from '../../../../shared/types'
import { ChartRenderer } from './ChartRenderer'

interface MessageListProps {
  messages: Message[]
  isStreaming: boolean
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="message-list">
      {messages.length === 0 && (
        <div className="empty-state">
          <p>Start a conversation with your AI assistant</p>
        </div>
      )}

      {messages.map((message) => (
        <div
          key={`${message.timestamp}-${message.role}`}
          className={`message message-${message.role}`}
        >
          <div className="message-role">{message.role}</div>
          <div className="message-content">
            {message.content || <em>Thinking...</em>}
          </div>

          {/* Render charts if present */}
          {message.chartData && message.chartData.length > 0 && (
            <div className="message-charts">
              {message.chartData.map((chart) => (
                <ChartRenderer key={chart.id} chartData={chart} />
              ))}
            </div>
          )}
        </div>
      ))}

      {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
        <div className="message message-assistant">
          <div className="message-role">assistant</div>
          <div className="message-content">
            <span className="loading">●</span>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  )
}
