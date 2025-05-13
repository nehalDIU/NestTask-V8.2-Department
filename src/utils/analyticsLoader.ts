/**
 * Utility to safely load Vercel Analytics and handle ad blockers
 */

// Flag to track if we've already attempted to load analytics
let analyticsAttempted = false;

/**
 * Safely loads the Vercel Analytics script with fallback handling
 */
export function safelyLoadAnalytics(): void {
  // Only try once
  if (analyticsAttempted || !import.meta.env.PROD) {
    return;
  }
  
  analyticsAttempted = true;
  
  try {
    // Create a non-blocking script loader
    const script = document.createElement('script');
    script.src = '/_vercel/insights/script.js';
    script.defer = true;
    script.dataset.sdkn = 'nesttask';
    script.dataset.sdkv = '1.0.0';
    
    // Add error handling
    script.onerror = () => {
      console.log('Vercel Analytics blocked or failed to load - continuing without analytics');
      // Remove the script to avoid further errors
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
    
    // Add to document with timeout for safety
    const appendScript = () => {
      document.body.appendChild(script);
    };
    
    // Use requestIdleCallback or setTimeout as fallback
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(appendScript);
    } else {
      setTimeout(appendScript, 1000);
    }
    
    // Add a timeout to make sure it gets removed if it doesn't load
    setTimeout(() => {
      if (script.parentNode && !script.hasAttribute('data-loaded')) {
        console.log('Vercel Analytics timed out - removing');
        script.parentNode.removeChild(script);
      }
    }, 5000);
  } catch (error) {
    console.error('Failed to initialize analytics:', error);
  }
}

/**
 * Global error handler for analytics errors
 */
export function setupAnalyticsErrorHandler(): void {
  if (!import.meta.env.PROD) return;
  
  try {
    // Global error handler for analytics-related errors
    window.addEventListener('error', (event) => {
      const errorDetails = event.error || event.message;
      const errorString = String(errorDetails);
      
      // Only handle analytics-related errors
      if (
        errorString.includes('vercel') ||
        errorString.includes('insight') ||
        (event.filename && event.filename.includes('vercel'))
      ) {
        console.log('Suppressing Vercel Analytics error');
        event.preventDefault();
        
        // Try to find and remove any problematic scripts
        const scripts = document.querySelectorAll('script[src*="vercel"], script[src*="insight"]');
        scripts.forEach(script => {
          if (script.parentNode) {
            script.parentNode.removeChild(script);
          }
        });
        
        return false;
      }
    }, true);
  } catch (error) {
    console.error('Failed to set up analytics error handler:', error);
  }
} 