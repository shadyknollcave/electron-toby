import { useState, useEffect, FormEvent } from 'react'
import { useConfig } from '../../hooks/useConfig'
import type { LLMConfig as LLMConfigType } from '../../../../shared/types'

export function LLMConfig() {
  const { config, updateLLM, isUpdating } = useConfig()

  const [formData, setFormData] = useState<LLMConfigType>({
    baseURL: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'llama2',
    temperature: 0.7,
    maxTokens: undefined,
    topP: 1.0,
    presencePenalty: 0.0,
    frequencyPenalty: 0.0,
    systemPrompt: ''
  })

  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Update form when config loads or changes
  useEffect(() => {
    if (config?.llm) {
      setFormData({
        baseURL: config.llm.baseURL,
        apiKey: config.llm.apiKey || '',
        model: config.llm.model,
        temperature: config.llm.temperature ?? 0.7,
        maxTokens: config.llm.maxTokens,
        topP: config.llm.topP ?? 1.0,
        presencePenalty: config.llm.presencePenalty ?? 0.0,
        frequencyPenalty: config.llm.frequencyPenalty ?? 0.0,
        systemPrompt: config.llm.systemPrompt || ''
      })
    }
  }, [config])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)

    try {
      await updateLLM(formData)
      setMessage({ type: 'success', text: 'LLM configuration saved successfully' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  return (
    <div className="llm-config">
      <h3>LLM Configuration</h3>

      {config?.llm && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <strong>Current Configuration:</strong> {config.llm.baseURL} / {config.llm.model}
          <br />
          <small>Edit the form below to update your settings</small>
        </div>
      )}

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="baseURL">Base URL</label>
          <input
            id="baseURL"
            type="url"
            value={formData.baseURL}
            onChange={(e) => setFormData({ ...formData, baseURL: e.target.value })}
            placeholder="http://localhost:11434/v1"
            required
          />
          <small>OpenAI-compatible endpoint (Ollama, vLLM, LocalAI, etc.)</small>
        </div>

        <div className="form-group">
          <label htmlFor="apiKey">API Key (optional)</label>
          <input
            id="apiKey"
            type="password"
            value={formData.apiKey}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            placeholder="sk-..."
          />
          <small>Leave empty if not required</small>
        </div>

        <div className="form-group">
          <label htmlFor="model">Model</label>
          <input
            id="model"
            type="text"
            value={formData.model}
            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            placeholder="llama2"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="temperature" title="Controls randomness: 0 = focused and deterministic, 1 = balanced, 2 = very creative and random">
            Temperature
          </label>
          <input
            id="temperature"
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={formData.temperature}
            onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
            title="Controls randomness: 0 = focused and deterministic, 1 = balanced, 2 = very creative and random"
          />
          <small>Controls creativity (0-2). Lower = focused, higher = creative</small>
        </div>

        <div className="form-group">
          <label htmlFor="maxTokens" title="Maximum length of the response. Each token is roughly 4 characters or 0.75 words">
            Max Tokens (optional)
          </label>
          <input
            id="maxTokens"
            type="number"
            min="1"
            value={formData.maxTokens || ''}
            onChange={(e) => setFormData({
              ...formData,
              maxTokens: e.target.value ? parseInt(e.target.value) : undefined
            })}
            placeholder="Leave empty for default"
            title="Maximum length of the response. Each token is roughly 4 characters or 0.75 words"
          />
          <small>Limits response length (leave empty for unlimited)</small>
        </div>

        <div className="form-group">
          <label htmlFor="topP" title="Alternative to temperature. Considers only the most probable words that add up to this probability. 1.0 = consider all words, 0.1 = only consider top 10%">
            Top P
          </label>
          <input
            id="topP"
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={formData.topP}
            onChange={(e) => setFormData({ ...formData, topP: parseFloat(e.target.value) })}
            title="Alternative to temperature. Considers only the most probable words that add up to this probability. 1.0 = consider all words, 0.1 = only consider top 10%"
          />
          <small>Limits word choices (0-1). Lower = more focused. Default: 1.0</small>
        </div>

        <div className="form-group">
          <label htmlFor="presencePenalty" title="Encourages talking about new topics. Positive values = more diverse topics, negative values = stay on current topic">
            Presence Penalty
          </label>
          <input
            id="presencePenalty"
            type="number"
            min="-2"
            max="2"
            step="0.1"
            value={formData.presencePenalty}
            onChange={(e) => setFormData({ ...formData, presencePenalty: parseFloat(e.target.value) })}
            title="Encourages talking about new topics. Positive values = more diverse topics, negative values = stay on current topic"
          />
          <small>Encourages new topics (-2 to 2). Positive = more variety. Default: 0</small>
        </div>

        <div className="form-group">
          <label htmlFor="frequencyPenalty" title="Reduces repetitive words and phrases. Positive values = less repetition, negative values = allows more repetition">
            Frequency Penalty
          </label>
          <input
            id="frequencyPenalty"
            type="number"
            min="-2"
            max="2"
            step="0.1"
            value={formData.frequencyPenalty}
            onChange={(e) => setFormData({ ...formData, frequencyPenalty: parseFloat(e.target.value) })}
            title="Reduces repetitive words and phrases. Positive values = less repetition, negative values = allows more repetition"
          />
          <small>Reduces repetition (-2 to 2). Positive = less repeat. Default: 0</small>
        </div>

        <div className="form-group">
          <label htmlFor="systemPrompt" title="Instructions that define how the AI should behave. This replaces the default MCP assistant behavior">
            Custom System Prompt (optional)
          </label>
          <textarea
            id="systemPrompt"
            rows={8}
            value={formData.systemPrompt}
            onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
            placeholder="You are an MCP development assistant..."
            style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
            title="Instructions that define how the AI should behave. This replaces the default MCP assistant behavior"
          />
          <small>Override default MCP assistant prompt (leave empty for default)</small>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button type="submit" disabled={isUpdating}>
            {isUpdating ? 'Saving...' : 'Save Configuration'}
          </button>

          {config?.llm && (
            <button
              type="button"
              onClick={() => {
                setFormData({
                  baseURL: 'http://host.docker.internal:11434/v1',
                  apiKey: '',
                  model: 'llama2',
                  temperature: 0.7,
                  maxTokens: undefined,
                  topP: 1.0,
                  presencePenalty: 0.0,
                  frequencyPenalty: 0.0,
                  systemPrompt: ''
                })
                setMessage(null)
              }}
              style={{ backgroundColor: '#6b7280' }}
            >
              Reset to Ollama Defaults
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
