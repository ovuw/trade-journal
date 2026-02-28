import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
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
            <button
              onClick={() => this.setState({ error: null })}
              className="btn-secondary text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
