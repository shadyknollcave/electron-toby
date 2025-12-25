export function About() {
  return (
    <div className="about-page">
      <div className="about-container">
        <div className="about-header">
          <img src="/logo.png" alt="TobyAI Logo" className="about-logo" />
          <h2>About MCP Chatbot</h2>
        </div>

        <div className="about-content">
          <section className="about-section">
            <h3>Purpose</h3>
            <p>
              MCP Chatbot is a powerful troubleshooting tool designed to help developers
              test, debug, and interact with Model Context Protocol (MCP) servers and tools.
              It provides a user-friendly interface for connecting to MCP servers, exploring
              available tools, and executing them in real-time conversations with LLMs.
            </p>
          </section>

          <section className="about-section">
            <h3>Features</h3>
            <ul className="feature-list">
              <li>Connect to multiple MCP servers (stdio and HTTP/SSE)</li>
              <li>Automatic tool discovery and integration</li>
              <li>Real-time streaming chat with tool execution</li>
              <li>OpenAI-compatible LLM endpoint support</li>
              <li>Dark, futuristic UI optimized for developer workflow</li>
              <li>Airgap network compatible (no external dependencies)</li>
            </ul>
          </section>

          <section className="about-section">
            <h3>Use Cases</h3>
            <ul className="feature-list">
              <li>Test and validate MCP server implementations</li>
              <li>Debug tool definitions and parameters</li>
              <li>Prototype MCP-powered AI agents</li>
              <li>Demonstrate MCP capabilities</li>
              <li>Learn and experiment with the MCP protocol</li>
            </ul>
          </section>

          <section className="about-section about-author">
            <h3>Author</h3>
            <div className="author-info">
              <p className="author-name">Pedro L. Fernandez</p>
              <a href="mailto:fernandez.pedro@gmail.com" className="author-email">
                fernandez.pedro@gmail.com
              </a>
            </div>
          </section>

          <section className="about-section">
            <h3>Technology Stack</h3>
            <div className="tech-stack">
              <span className="tech-badge">React</span>
              <span className="tech-badge">TypeScript</span>
              <span className="tech-badge">Node.js</span>
              <span className="tech-badge">Express</span>
              <span className="tech-badge">MCP SDK</span>
              <span className="tech-badge">OpenAI API</span>
            </div>
          </section>

          <section className="about-section">
            <h3>Version</h3>
            <p className="version-info">v1.0.0</p>
          </section>
        </div>
      </div>
    </div>
  )
}
