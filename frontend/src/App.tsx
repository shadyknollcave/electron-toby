import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { ChatInterface } from './components/chat/ChatInterface'
import { ConfigPanel } from './components/config/ConfigPanel'
import { About } from './components/common/About'
import { useHealthCheck } from './hooks/useConfig'
import './App.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
})

function AppContent() {
  const [currentView, setCurrentView] = useState<'chat' | 'config' | 'about'>('chat')
  const { data: health } = useHealthCheck()

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <img src="/logo.png" alt="TobyAI Logo" className="app-logo" />
          <h1>MCP Chatbot</h1>
        </div>
        <div className="header-actions">
          <div className="health-indicator">
            {health?.status === 'healthy' ? (
              <span className="status-healthy">● Connected</span>
            ) : (
              <span className="status-unhealthy">● Disconnected</span>
            )}
          </div>
          <button onClick={() => setCurrentView('chat')} className={currentView === 'chat' ? 'active' : ''}>
            Chat
          </button>
          <button onClick={() => setCurrentView('config')} className={currentView === 'config' ? 'active' : ''}>
            Settings
          </button>
          <button onClick={() => setCurrentView('about')} className={currentView === 'about' ? 'active' : ''}>
            About
          </button>
        </div>
      </header>

      <main className="app-main">
        {currentView === 'chat' && <ChatInterface />}
        {currentView === 'config' && <ConfigPanel />}
        {currentView === 'about' && <About />}
      </main>

      <footer className="app-footer">
        <img src="/logo.png" alt="TobyAI Logo" className="footer-logo" />
        <p>MCP-Enabled Chatbot v1.0.0</p>
      </footer>
    </div>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
