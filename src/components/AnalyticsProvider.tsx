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
    // Load our mock analytics script as a fallback
    // This will ensure it's available if the real script 404s
    const loadFallbackScript = () => {
      const script = document.createElement('script');
      script.src = '/vercel-analytics-mock.js';
      script.id = 'vercel-analytics-fallback';
      script.async = true;
      document.head.appendChild(script);
      console.debug('Preloaded Vercel Analytics fallback script');
    };

    // Add a global error handler for scripts to catch analytics loading errors
    const handleScriptError = (event: ErrorEvent) => {
      if (
        (event.filename?.includes('vercel') ||
         event.filename?.includes('analytics') ||
         event.filename?.includes('insights') ||
         event.message?.includes('vercel') ||
         event.message?.includes('analytics'))
      ) {
        // This is a Vercel Analytics-related error
        setHasError(true);
        
        // If it's a 404 error, load our fallback script
        if (event.message?.includes('404') || event.message?.includes('Not Found')) {
          // Load our fallback implementation
          loadFallbackScript();
        }
        
        // Prevent the error from propagating
        event.preventDefault();
        console.warn('Vercel Analytics script failed to load. Using fallback implementation.');
        return true;
      }
      return false;
    };

    // Handle fetch errors for analytics scripts
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      // Add a random query parameter to prevent caching for analytics requests
      if (typeof input === 'string' && 
          (input.includes('vercel') || input.includes('analytics') || input.includes('insights'))) {
        
        // Add cache busting parameter
        const url = new URL(input, window.location.origin);
        url.searchParams.set('_cb', Date.now().toString());
        input = url.toString();
        
        // Add cache control headers
        init = {
          ...init,
          headers: {
            ...init?.headers,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        };
      }
      
      return originalFetch.call(window, input, init).catch(err => {
        // If it's a 404 for analytics script, load our fallback
        if (typeof input === 'string' && 
            (input.includes('vercel') || input.includes('analytics') || input.includes('insights'))) {
          console.warn('Vercel Analytics fetch failed, using fallback', err);
          loadFallbackScript();
        }
        throw err;
      });
    };

    // Load the fallback script preemptively
    if (isProduction) {
      loadFallbackScript();
    }

    // Add error event listener
    window.addEventListener('error', handleScriptError, true);
    
    return () => {
      // Cleanup
      window.removeEventListener('error', handleScriptError, true);
      window.fetch = originalFetch;
    };
  }, [isProduction]);

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