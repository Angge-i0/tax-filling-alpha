import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#fff',
          borderRadius: '12px',
          margin: '20px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          color: '#1e3a5f'
        }}>
          <div style={{ fontSize: '3em', marginBottom: '20px' }}>⚠️</div>
          <h2 style={{ margin: '0 0 10px 0' }}>Application Error</h2>
          <p style={{ color: '#64748b', fontSize: '0.95em', marginBottom: '20px' }}>
            A rendering error occurred. This is often caused by missing map data or an unexpected feature property.
          </p>
          <pre style={{
            background: '#f1f5f9',
            padding: '15px',
            borderRadius: '6px',
            fontSize: '0.8em',
            overflowX: 'auto',
            textAlign: 'left',
            marginBottom: '20px',
            maxHeight: '200px'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            Reload and Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
