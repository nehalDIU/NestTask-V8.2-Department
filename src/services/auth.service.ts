import { supabase } from '../lib/supabase';
import { getAuthErrorMessage } from '../utils/authErrors';
import type { LoginCredentials, SignupCredentials, User } from '../types/auth';
import type { Database } from '../types/supabase';
import { showSuccessToast, showErrorToast } from '../utils/notifications';

type DbUser = Database['public']['Tables']['users']['Row'];
type DbUserInsert = Database['public']['Tables']['users']['Insert'];

// Default user settings
const defaultUserSettings = {
  theme: 'light',
  notifications: true,
  language: 'en',
};

// Check if "Remember me" is enabled
const isRememberMeEnabled = () => localStorage.getItem('nesttask_remember_me') === 'true';

// Define a custom interface for the database user to avoid conflicts
interface SupabaseUser {
  id: string;
  email: string;
  name?: string | null;
  username?: string;
  role?: string;
  created_at?: string;
  last_active?: string;
  avatar?: string;
  phone?: string;
  department_id?: string;
  batch_id?: string;
  section_id?: string;
  student_id?: string;
}

export async function loginUser({ email, password }: LoginCredentials): Promise<User> {
  try {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Set session persistence by ensuring we have a clean session state
    await supabase.auth.setSession({
      access_token: '',
      refresh_token: ''
    });

    // Set remember me to always true for persistent login
    localStorage.setItem('nesttask_remember_me', 'true');
    
    // Store the email for easy login in the future
    localStorage.setItem('nesttask_saved_email', email);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ 
      email, 
      password
    });
    
    if (authError) throw authError;
    if (!authData?.user) throw new Error('No user data received');

    // Store the session in localStorage AND IndexedDB for maximum persistence
    if (authData.session) {
      // Set up a periodic token refresh to ensure the session never expires
      // This runs every 12 hours to refresh the token silently in the background
      setupTokenRefresh(authData.session.refresh_token);
      
      // Store session data for persistence across browser restarts
      localStorage.setItem('supabase.auth.token', JSON.stringify(authData.session));
      
      // Also store in persistent storage for redundancy
      try {
        if ('indexedDB' in window) {
          const request = indexedDB.open('nesttask-auth-storage', 1);
          
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('auth')) {
              db.createObjectStore('auth');
            }
          };
          
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('auth', 'readwrite');
            const store = tx.objectStore('auth');
            
            // Store session data
            store.put(JSON.stringify(authData.session), 'session');
            store.put(email, 'email');
            store.put(true, 'remember_me');
            
            tx.oncomplete = () => {
              db.close();
            };
          };
        }
      } catch (e) {
        console.warn('IndexedDB storage failed, falling back to localStorage only', e);
      }
    }

    // Wait briefly for the trigger to create the profile
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get user profile data
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select()
      .eq('id', authData.user.id)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle no rows gracefully

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      // Create profile if it doesn't exist or there was an error
      const newUser: DbUserInsert = {
        id: authData.user.id,
        email: authData.user.email!,
        name: authData.user.user_metadata?.name || authData.user.email?.split('@')[0] || '',
        role: authData.user.user_metadata?.role || 'user',
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString()
      };

      const { data: newProfile, error: createError } = await supabase
        .from('users')
        .insert(newUser)
        .select()
        .single();

      if (createError) {
        throw new Error('Failed to create user profile');
      }

      if (!newProfile) {
        throw new Error('No profile data received after creation');
      }

      return mapDbUserToUser(newProfile);
    }

    if (!profile) {
      // Create profile if it doesn't exist
      const newUser: DbUserInsert = {
        id: authData.user.id,
        email: authData.user.email!,
        name: authData.user.user_metadata?.name || authData.user.email?.split('@')[0] || '',
        role: authData.user.user_metadata?.role || 'user',
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString()
      };

      const { data: newProfile, error: createError } = await supabase
        .from('users')
        .insert(newUser)
        .select()
        .single();

      if (createError) {
        throw new Error('Failed to create user profile');
      }

      if (!newProfile) {
        throw new Error('No profile data received after creation');
      }

      return mapDbUserToUser(newProfile);
    }

    return mapDbUserToUser(profile);
  } catch (error: any) {
    console.error('Login error:', error);
    throw new Error(getAuthErrorMessage(error));
  }
}

export async function signupUser({ 
  email, 
  password, 
  name, 
  phone, 
  studentId, 
  departmentId, 
  batchId, 
  sectionId 
}: SignupCredentials): Promise<User> {
  try {
    // Validate required fields
    if (!email || !password || !name || !phone || !studentId) {
      throw new Error('All fields are required');
    }

    // Validate email domain if required for your university
    if (!email.endsWith('@diu.edu.bd')) {
      throw new Error('Please use your university email (@diu.edu.bd)');
    }

    console.log('Signup data:', {
      email, name, phone, studentId, departmentId, batchId, sectionId
    });

    // Register with Supabase Auth - ensure we use the correct metadata structure
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          // Use consistent field names matching what the trigger expects
          name,
          phone,
          studentId,
          role: 'user', // Default role
          departmentId,
          batchId,
          sectionId
        }
      }
    });

    if (error) throw error;

    if (!data?.user) {
      throw new Error('Failed to create user');
    }

    // Don't insert into public.users - let the handle_new_user trigger do it
    // Since the trigger will take care of creating the public.users record
    console.log('User created in auth, relying on database trigger to create profile');

    // Wait a longer time for the trigger to complete (2 seconds should be enough)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the user data from the database to ensure we have the correct role and other fields
    const { data: userData, error: userDataError } = await supabase
      .from('users_with_full_info')  // Use the new view with joined data
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userDataError) {
      console.error('Error fetching user data after signup:', userDataError);
      
      // Try one more time with the users table
      const { data: basicUserData, error: basicUserError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();
        
      if (basicUserError) {
        console.error('Second attempt failed to fetch user data:', basicUserError);
        // If we can't get the user data, return what we have
        return {
          id: data.user.id,
          email,
          name,
          phone,
          studentId,
          role: 'user',
          createdAt: new Date().toISOString(),
          departmentId,
          batchId,
          sectionId
        };
      }
      
      return mapDbUserToUser(basicUserData);
    }

    // Return the user data with all related info
    return {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      role: userData.role as 'user' | 'admin' | 'super-admin' | 'section-admin',
      phone: userData.phone,
      studentId: userData.studentId,
      createdAt: userData.createdAt,
      lastActive: userData.lastActive,
      departmentId: userData.departmentId,
      departmentName: userData.departmentName,
      batchId: userData.batchId,
      batchName: userData.batchName,
      sectionId: userData.sectionId,
      sectionName: userData.sectionName
    };
  } catch (error: any) {
    console.error('Signup error:', error);
    throw new Error(error.message || 'Failed to create account');
  }
}

export async function logoutUser(): Promise<void> {
  try {
    console.log('Starting logoutUser in auth.service...');
    
    // Clear any existing refresh intervals
    const intervalId = localStorage.getItem('nesttask_refresh_interval');
    if (intervalId) {
      clearInterval(parseInt(intervalId));
      localStorage.removeItem('nesttask_refresh_interval');
    }

    // Remove focus event listener
    window.removeEventListener('focus', handleFocusRefresh);

    // First try the regular sign out
    const { error } = await supabase.auth.signOut({
      scope: 'local' // Only clear the local session
    });
    
    if (error) {
      console.error('Supabase signOut error:', error);
      // Even if there's an error, continue with cleanup
    } else {
      console.log('Supabase auth.signOut successful');
    }

    // Clear all auth-related items
    console.log('Clearing local storage items...');
    localStorage.removeItem('nesttask_remember_me');
    localStorage.removeItem('nesttask_saved_email');
    localStorage.removeItem('supabase.auth.token');
    sessionStorage.removeItem('supabase.auth.token');
    
    // Clear IndexedDB storage
    try {
      if ('indexedDB' in window) {
        console.log('Clearing IndexedDB storage...');
        const request = indexedDB.open('nesttask-auth-storage', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('auth', 'readwrite');
          const store = tx.objectStore('auth');
          store.clear();
          tx.oncomplete = () => {
            db.close();
          };
        };
      }
    } catch (e) {
      console.warn('Failed to clear IndexedDB storage:', e);
    }
    
    console.log('Logout process in auth.service completed');
  } catch (error: any) {
    console.error('Logout error:', error);
    throw new Error('Failed to sign out. Please try again.');
  }
}

// Helper function to handle focus refresh
async function handleFocusRefresh() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      await supabase.auth.refreshSession({
        refresh_token: data.session.refresh_token,
      });
    }
  } catch (err) {
    console.error('Failed to refresh token on focus:', err);
  }
}

// Helper function to setup token refresh
function setupTokenRefresh(refreshToken: string) {
  // Setup a periodic refresh every 12 hours
  const refreshInterval = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
  
  // Store the interval ID so we can clear it on logout
  const intervalId = setInterval(async () => {
    try {
      // Get the current session
      const { data } = await supabase.auth.getSession();
      
      if (data?.session) {
        // Refresh the session
        const { data: refreshData, error } = await supabase.auth.refreshSession({
          refresh_token: data.session.refresh_token,
        });
        
        if (error) {
          console.error('Error refreshing token:', error);
          return;
        }
        
        // Successfully refreshed - update stored session
        if (refreshData?.session) {
          localStorage.setItem('supabase.auth.token', JSON.stringify(refreshData.session));
        }
      }
    } catch (err) {
      console.error('Failed to refresh token:', err);
    }
  }, refreshInterval);
  
  // Store the interval ID in localStorage so we can retrieve it across page loads
  localStorage.setItem('nesttask_refresh_interval', intervalId.toString());
  
  // Add focus event listener for when user returns to the tab
  window.addEventListener('focus', handleFocusRefresh);
}

// Add proper role caching to ensure persistence on refresh
export const mapDbUserToUser = (dbUser: Database['public']['Tables']['users']['Row'], isGuest: boolean = false): User => {
  // For super admin users, ensure we store the role for refresh detection
  if (dbUser.role === 'super-admin') {
    console.log('Mapping super-admin user, caching role');
    try {
      localStorage.setItem('user_role', 'super-admin');
    } catch (error) {
      console.error('Failed to cache super-admin role:', error);
    }
  }
  
  // Continue with existing mapping code
  return {
    id: dbUser.id,
    email: dbUser.email || '',
    name: dbUser.name || 'Anonymous',
    role: (dbUser.role as 'user' | 'admin' | 'super-admin' | 'section_admin') || 'user',
    phone: dbUser.phone || undefined,
    avatar: dbUser.avatar || undefined,
    sectionId: dbUser.section_id || undefined,
    sectionName: undefined, // Will be filled in by another query if needed
    studentId: dbUser.student_id || undefined,
    createdAt: dbUser.created_at || null
  };
};

export async function resetPassword(email: string): Promise<void> {
  try {
    if (!email) {
      throw new Error('Email is required');
    }
    
    console.log('Sending password reset email to:', email);
    
    // The redirectTo URL must be added to the "Additional Redirect URLs" in the Supabase Dashboard
    // under Authentication -> URL Configuration
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Add the hash fragment to force our app to show the reset password UI
      redirectTo: `${window.location.origin}/#auth/recovery`,
    });
    
    if (error) {
      console.error('Supabase resetPasswordForEmail error:', error);
      throw error;
    }
    
    console.log('Password reset email sent successfully');
  } catch (error: any) {
    console.error('Password reset error:', error);
    throw new Error(getAuthErrorMessage(error) || 'Failed to send password reset email. Please try again.');
  }
}

export async function refreshUserRole(): Promise<boolean> {
  try {
    showSuccessToast('Refreshing user role...');
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Error fetching current user:', userError);
      showErrorToast('Could not fetch user information');
      return false;
    }
    
    console.log('Current user metadata before refresh:', user.user_metadata);
    
    // Get user role from database
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
      
    if (dbError) {
      console.error('Error fetching user role from database:', dbError);
      showErrorToast('Could not fetch role information');
      return false;
    }
    
    if (!userData?.role) {
      console.warn('No role found in database for user');
      showErrorToast('No role found in database');
      return false;
    }
    
    console.log('Role found in database:', userData.role);
    
    // Update user metadata with role from database
    if (userData.role !== user.user_metadata?.role) {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { 
          ...user.user_metadata,
          role: userData.role 
        }
      });
      
      if (updateError) {
        console.error('Error updating user metadata:', updateError);
        showErrorToast('Failed to update role');
        return false;
      }
      
      console.log('Successfully updated user role in metadata to:', userData.role);
      showSuccessToast(`Role updated to ${userData.role}. Reloading...`);
      
      // Reload the page after a short delay to allow time for the toast to be seen
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
      return true;
    } else {
      console.log('User role already matches database, no update needed');
      showSuccessToast('Role is already up to date');
      return true;
    }
  } catch (error) {
    console.error('Error in refreshUserRole:', error);
    showErrorToast('Error updating role');
    return false;
  }
}