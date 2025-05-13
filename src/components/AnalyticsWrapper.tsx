import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';

/**
 * A wrapper for the Vercel Analytics component that handles blocked scripts gracefully
 * and respects user privacy preferences.
 */
export function AnalyticsWrapper() {
  const [isAnalyticsBlocked, setIsAnalyticsBlocked] = useState(false);
  
  useEffect(() => {
    // Check if analytics is likely to be blocked
    const checkAnalyticsBlocking = async () => {
      try {
        // Try to load a test resource from Vercel
        const testUrl = 'https://vitals.vercel-insights.com/v1/vitals';
        const controller = new AbortController();
        
        // Set a timeout to abort the fetch
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        
        const response = await fetch(testUrl, { 
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        setIsAnalyticsBlocked(false);
      } catch (error) {
        // If fetch fails, analytics is likely blocked
        console.debug('Analytics may be blocked by client, disabling integration');
        setIsAnalyticsBlocked(true);
      }
    };
    
    // Only run in production
    if (import.meta.env.PROD) {
      checkAnalyticsBlocking();
    }
    
    // Check for Do Not Track preference
    const dntEnabled = 
      navigator.doNotTrack === '1' || 
      (window as any).doNotTrack === '1' ||
      navigator.doNotTrack === 'yes';
      
    if (dntEnabled) {
      console.debug('Respecting Do Not Track preference, disabling analytics');
      setIsAnalyticsBlocked(true);
    }
  }, []);
  
  // Only render Analytics in production and when not blocked
  if (!import.meta.env.PROD || isAnalyticsBlocked) {
    return null;
  }
  
  return <Analytics mode="auto" debug={false} />;
} 