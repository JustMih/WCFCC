import React from 'react';

class ResizeObserverErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // Only handle ResizeObserver errors
    if (error.message && error.message.includes('ResizeObserver')) {
      return { hasError: true };
    }
    return null;
  }

  componentDidCatch(error, errorInfo) {
    // Log the error but don't crash the app
    if (error.message && error.message.includes('ResizeObserver')) {
      console.warn('ResizeObserver error caught and handled:', error);
    } else {
      // Re-throw non-ResizeObserver errors
      throw error;
    }
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return this.props.fallback || <div>Something went wrong with the layout.</div>;
    }

    return this.props.children;
  }
}

export default ResizeObserverErrorBoundary; 