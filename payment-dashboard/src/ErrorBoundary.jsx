import { Component } from 'react'

/**
 * @typedef {Object} ErrorBoundaryProps
 * @property {import('react').ReactNode} [children]
 * @property {string} [errorMessage]
 * @property {string} [retryLabel]
 * @property {() => void} [onRetry]
 */

/**
 * @typedef {Object} ErrorBoundaryState
 * @property {boolean} hasError
 * @property {Error | null} error
 */

/**
 * @extends {Component<ErrorBoundaryProps, ErrorBoundaryState>}
 */
class ErrorBoundary extends Component {
  /**
   * @param {ErrorBoundaryProps} props
   */
  constructor(props) {
    super(props)
    /** @type {ErrorBoundaryState} */
    this.state = { hasError: false, error: null }
  }

  /**
   * @param {Error} error
   * @returns {Partial<ErrorBoundaryState>}
   */
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  /**
   * @param {Error} error
   * @param {import('react').ErrorInfo} errorInfo
   */
  componentDidCatch(error, errorInfo) {
    console.error('Unhandled error caught by ErrorBoundary:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
    if (typeof this.props.onRetry === 'function') {
      this.props.onRetry()
    }
  }

  render() {
    if (this.state.hasError) {
      const { errorMessage, retryLabel } = this.props
      return (
        <div className="error-boundary" role="alert">
          <h1>Something went wrong</h1>
          <p>
            {errorMessage ||
              'An unexpected error occurred while rendering this page. You can try reloading the page to recover.'}
          </p>
          {this.state.error && this.state.error.message ? (
            <pre className="error-boundary-details">
              {this.state.error.message}
            </pre>
          ) : null}
          <button type="button" onClick={this.handleRetry}>
            {retryLabel || 'Retry'}
          </button>
          <button type="button" onClick={this.handleReload}>
            Reload page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary