/**
 * React Error Boundary for catching render errors in child components.
 * Prevents the entire page from crashing when a single panel or block fails.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  readonly children: ReactNode
  readonly fallbackLabel?: string
}

interface ErrorBoundaryState {
  readonly hasError: boolean
  readonly error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In production, this would go to an error reporting service.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const label = this.props.fallbackLabel ?? 'Something went wrong'
      return (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-5 py-6 text-center"
          role="alert"
        >
          <div className="text-sm font-medium text-red-700">{label}</div>
          <div className="mt-2 text-xs text-red-600">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 rounded-lg border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
