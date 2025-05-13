import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { SuperAdminDashboard } from './SuperAdminDashboard';
import { LoadingScreen } from '@/components/LoadingScreen';
import { supabase } from '@/lib/supabase';

/**
 * This component acts as a wrapper for the SuperAdminDashboard
 * with dedicated session verification and restoration logic
 * specifically for handling page refreshes
 */
export function SuperAdminRoute() {
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifySession = async () => {
      try {
        console.log('SuperAdminRoute: Verifying session on mount');
        setLoading(true);
        
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.error('SuperAdminRoute: No session found');
          setError('No active session. Please log in again.');
          setIsAuthorized(false);
          setLoading(false);
          return;
        }
        
        console.log('SuperAdminRoute: Session found, checking role');
        
        // First try to get role from session metadata if available
        const metadataRole = session.user.user_metadata?.role;
        if (metadataRole === 'super-admin') {
          console.log('SuperAdminRoute: Super admin role found in metadata');
          setIsAuthorized(true);
          setLoading(false);
          return;
        }
        
        // If not in metadata, check the database
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single();
        
        if (userError) {
          console.error('SuperAdminRoute: Error fetching user:', userError);
          setError('Error verifying your role. Please try again.');
          setIsAuthorized(false);
          setLoading(false);
          return;
        }
        
        if (userData?.role === 'super-admin') {
          console.log('SuperAdminRoute: Super admin role confirmed in database');
          setIsAuthorized(true);
        } else {
          console.warn('SuperAdminRoute: User is not a super admin', userData?.role);
          setError('You do not have super admin privileges.');
          setIsAuthorized(false);
        }
      } catch (err) {
        console.error('SuperAdminRoute: Verification error:', err);
        setError('An unexpected error occurred. Please try again.');
        setIsAuthorized(false);
      } finally {
        setLoading(false);
      }
    };
    
    verifySession();
    
    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('SuperAdminRoute: Auth state changed:', event);
      if (event === 'SIGNED_OUT') {
        setIsAuthorized(false);
        setLoading(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Re-verify permissions
        verifySession();
      }
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // While loading, show loading screen
  if (loading) {
    return <LoadingScreen message="Verifying super admin access..." />;
  }
  
  // If not authorized, redirect to home
  if (!isAuthorized) {
    return <Navigate to="/" replace />;
  }
  
  // If authorized, render the dashboard
  return <SuperAdminDashboard />;
} 