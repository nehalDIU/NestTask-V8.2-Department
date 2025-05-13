import React, { useEffect, useState, Component, ErrorInfo, ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/react';

// Custom error boundary component
class ErrorBoundary extends Component<{ children: ReactNode, fallback?: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode, fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.warn('Vercel Analytics error:', error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

export const AnalyticsProvider: React.FC = () => {
  const [hasError, setHasError] = useState(false);
  const [isProduction] = useState(() => import.meta.env.PROD === true);

  useEffect(() => {
    // Add a global error handler for scripts to catch analytics loading errors
    const handleScriptError = (event: ErrorEvent) => {
      if (
        event.filename?.includes('vercel') ||
        event.filename?.includes('analytics') ||
        event.message?.includes('vercel') ||
        event.message?.includes('analytics')
      ) {
        setHasError(true);
        // Prevent the error from propagating
        event.preventDefault();
        console.warn('Vercel Analytics script blocked or failed to load. This is usually caused by ad blockers.');
      }
    };

    window.addEventListener('error', handleScriptError, true);
    
    return () => {
      window.removeEventListener('error', handleScriptError, true);
    };
  }, []);

  // Don't render anything if not in production or if there was an error
  if (!isProduction || hasError) {
    return null;
  }

  // Render the Analytics component with error boundary
  return (
    <ErrorBoundary fallback={null}>
      <Analytics debug={false} />
    </ErrorBoundary>
  );
}; 