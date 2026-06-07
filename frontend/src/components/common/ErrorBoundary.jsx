/**
 * ErrorBoundary — Catches React rendering errors and shows a fallback UI.
 */
import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="errorBoundary">
          <div className="errorBoundaryCard">
            <h1>Something went wrong</h1>
            <p>
              An unexpected error occurred. Please refresh the page to try again.
            </p>
            <button
              type="button"
              className="errorBoundaryBtn"
              onClick={() => window.location.reload()}
            >
              Refresh page
            </button>
            {import.meta.env.MODE !== "production" && this.state.error && (
              <pre className="errorBoundaryPre">{this.state.error.toString()}</pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
