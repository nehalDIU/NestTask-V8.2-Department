import { supabase } from '../lib/supabase';

interface SessionCache {
  userId: string | null;
  role: string | null;
  lastChecked: number;
}

/**
 * Tracks the current auth session and provides recovery utilities
 * especially for admin routes that need persistent sessions
 */
export const sessionRecovery = {
  /**
   * Session cache to reduce API calls
   */
  sessionCache: {
    userId: null,
    role: null,
    lastChecked: 0
  } as SessionCache,

  /**
   * Get the current user's session information
   */
  async getSessionInfo(forceRefresh = false): Promise<SessionCache> {
    // Use cached value if available and not forcing refresh
    const now = Date.now();
    if (
      !forceRefresh && 
      this.sessionCache.userId && 
      this.sessionCache.lastChecked > now - 5 * 60 * 1000
    ) {
      return this.sessionCache;
    }

    try {
      // First try to get session from Supabase
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        this.sessionCache = { userId: null, role: null, lastChecked: now };
        return this.sessionCache;
      }
      
      // Get user's role from the database
      const { data: userData, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();
      
      if (error) {
        console.error('Error fetching user role:', error);
        // Use cached role if we can't get it from the database
        this.sessionCache = { 
          userId: session.user.id, 
          role: session.user.user_metadata?.role || null, 
          lastChecked: now 
        };
      } else {
        this.sessionCache = { 
          userId: session.user.id, 
          role: userData?.role || null, 
          lastChecked: now 
        };
      }
      
      return this.sessionCache;
    } catch (error) {
      console.error('Error in getSessionInfo:', error);
      // On error, clear cache and return null values
      this.sessionCache = { userId: null, role: null, lastChecked: now };
      return this.sessionCache;
    }
  },

  /**
   * Check if the current session is for a super admin user
   */
  async isCurrentUserSuperAdmin(): Promise<boolean> {
    const { role } = await this.getSessionInfo();
    return role === 'super-admin';
  },

  /**
   * Check if the current session is for an admin user (any type)
   */
  async isCurrentUserAdmin(): Promise<boolean> {
    const { role } = await this.getSessionInfo();
    return role === 'admin' || role === 'super-admin' || role === 'section-admin';
  },

  /**
   * Force a session refresh and redirect if necessary
   */
  async recoverSession(): Promise<boolean> {
    try {
      // Try to refresh the session first
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error || !data.session) {
        console.error('Session refresh failed:', error);
        return false;
      }
      
      // Get full session info
      const sessionInfo = await this.getSessionInfo(true);
      
      // If on super-admin route but not a super admin, redirect
      if (
        window.location.pathname.startsWith('/super-admin') && 
        sessionInfo.role !== 'super-admin'
      ) {
        window.location.href = '/';
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error recovering session:', error);
      return false;
    }
  },

  /**
   * Handle page reload/refresh specifically for admin routes
   */
  handlePageReload() {
    // Check if we're on an admin route
    const isAdminRoute = 
      window.location.pathname.startsWith('/admin') ||
      window.location.pathname.startsWith('/super-admin');
    
    if (isAdminRoute) {
      // Add event listener for page visibility changes
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
          // Check session when tab becomes visible again
          const sessionValid = await this.recoverSession();
          
          if (!sessionValid) {
            console.warn('Session invalid after visibility change, redirecting to login');
            window.location.href = '/';
          }
        }
      });
      
      // Initialize session recovery
      this.recoverSession().then(sessionValid => {
        if (!sessionValid) {
          console.warn('Initial session recovery failed, redirecting to login');
          window.location.href = '/';
        }
      });
    }
  }
};

// Auto-initialize session recovery
document.addEventListener('DOMContentLoaded', () => {
  sessionRecovery.handlePageReload();
}); 