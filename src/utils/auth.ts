// Auth utilities for handling auth-related functions across the app

import { supabase } from '../lib/supabase';

/**
 * Forces a clean reload of the application after login
 * This helps ensure PWA cache is refreshed for authenticated views
 */
export function forceCleanReload(): void {
  // Check if we're on a super admin page
  const isSuperAdmin = window.location.pathname.includes('super-admin') || 
                       sessionStorage.getItem('is_super_admin') === 'true' ||
                       localStorage.getItem('is_super_admin') === 'true';
  
  console.log('Force clean reload called, isSuperAdmin:', isSuperAdmin);
  
  // Clear any cached HTML/JS that might be causing the blank page
  if ('caches' in window) {
    caches.keys().then(cacheNames => {
      cacheNames.forEach(cacheName => {
        if (isSuperAdmin && cacheName.includes('nesttask')) {
          // For super admin, be more selective about cache clearing
          // Just clear specific URLs but keep the super admin routes
          caches.open(cacheName).then(cache => {
            cache.keys().then(requests => {
              requests.forEach(request => {
                const url = new URL(request.url);
                // Don't delete super-admin related assets
                if (!url.pathname.includes('super-admin')) {
                  cache.delete(request);
                }
              });
            });
          });
        } else if (cacheName.includes('nesttask')) {
          // For normal users, clear entire caches
          console.log(`Clearing cache: ${cacheName}`);
          caches.delete(cacheName)
            .then(deleted => console.log(`Cache deleted: ${deleted}`));
        }
      });
    });
  }
  
  // Notify service worker to clear or preserve caches based on role
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    // Send different message based on role
    if (isSuperAdmin) {
      navigator.serviceWorker.controller.postMessage({
        type: 'PRESERVE_ADMIN_CACHES',
        timestamp: Date.now()
      });
    } else {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLEAR_ALL_CACHES',
        timestamp: Date.now()
      });
    }
    
    // Listen for response from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && 
         (event.data.type === 'CACHES_CLEARED' || 
          event.data.type === 'ADMIN_CACHES_PRESERVED')) {
        console.log('Service worker processed cache request, reloading page');
        
        // For super admin, use a different reload approach
        if (isSuperAdmin) {
          // Store current path
          const currentPath = window.location.pathname;
          // Set flag to indicate we're in the middle of a super admin reload
          sessionStorage.setItem('super_admin_reloading', 'true');
          sessionStorage.setItem('super_admin_path', currentPath);
          
          // Use a technique that preserves more state
          window.location.href = currentPath;
        } else {
          // Normal reload for other users
          window.location.reload();
        }
      }
    }, { once: true }); // Only listen once
    
    // Fallback reload in case service worker doesn't respond
    setTimeout(() => {
      console.log('Forcing page reload after timeout');
      
      if (isSuperAdmin) {
        // Set reload flags and preserve path
        const currentPath = window.location.pathname;
        sessionStorage.setItem('super_admin_reloading', 'true');
        sessionStorage.setItem('super_admin_path', currentPath);
        
        // Navigate instead of reload
        window.location.href = currentPath;
      } else {
        window.location.reload();
      }
    }, 1000);
  } else {
    // If no service worker, just reload the page
    window.location.reload();
  }
}

/**
 * Updates the authentication status in the service worker
 * for proper caching behavior
 */
export function updateAuthStatus(isLoggedIn: boolean): void {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'AUTH_STATE_CHANGED',
      event: isLoggedIn ? 'SIGNED_IN' : 'SIGNED_OUT',
      timestamp: Date.now()
    });
  }
} 