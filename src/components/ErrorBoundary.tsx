import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Copy } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  componentStack: string | null
  copied: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? null })
    try {
      const entries = JSON.parse(localStorage.getItem('tj_crash_log') || '[]') as object[]
      entries.unshift({ ts: new Date().toISOString(), message: error.message, stack: info.componentStack })
      localStorage.setItem('tj_crash_log', JSON.stringify(entries.slice(0, 5)))
    } catch { /* ignore */ }
  }

  handleCopy = () => {
    const { error, componentStack } = this.state
    const report = JSON.stringify({ ts: new Date().toISOString(), message: error?.message, stack: componentStack }, null, 2)
    void navigator.clipboard.writeText(report).then(() => {
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md px-6">
            <AlertTriangle size={40} className="text-warning mx-auto mb-4" />
            <h1 className="text-text-primary font-semibold text-lg mb-2">Something went wrong</h1>
            <p className="text-text-secondary text-sm mb-4">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => this.setState({ error: null, componentStack: null })}
                className="btn-secondary text-sm"
              >
                Try again
              </button>
              <button
                onClick={this.handleCopy}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <Copy size={13} />
                {this.state.copied ? 'Copied!' : 'Copy error report'}
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
