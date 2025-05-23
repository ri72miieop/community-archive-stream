import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import posthog from '~core/posthog'
import { DevLog } from '~utils/devUtils'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
  errorId?: string
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    }
  }

  // Generate a unique error ID without external libraries
  private generateErrorId(): string {
    // Combine timestamp with random numbers for uniqueness
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${randomPart}`;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    
    const errorId = this.generateErrorId();
    
    this.setState({
      error,
      errorInfo,
      errorId
    })
    
    
    posthog.capture("error-boundary", {
      error_id: errorId,
      source: "error-boundary",
      error_message: error.message,
      error_name: error.name,
      error_stack: error.stack,
      component_stack: errorInfo.componentStack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent,
      browser: {
        language: navigator.language,
        platform: navigator.platform,
        cookieEnabled: navigator.cookieEnabled
      }
    })
    
    DevLog("Error caught by boundary:", error, errorInfo, "Error ID:", errorId)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-4 rounded-lg bg-red-50 border border-red-200">
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-red-700 mb-2">
            Error ID: {this.state.errorId}
          </p>
          <p className="text-xs text-red-600">
            Please contact support with this error ID for assistance.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <div className="text-sm text-red-700 mt-4 pt-4 border-t border-red-200">
              <p className="font-medium">Error:</p>
              <pre className="mt-1 whitespace-pre-wrap">
                {this.state.error?.toString()}
              </pre>
              {this.state.errorInfo && (
                <>
                  <p className="font-medium mt-4">Component Stack:</p>
                  <pre className="mt-1 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary