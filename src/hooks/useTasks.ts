import { useState, useEffect, useCallback } from 'react';
import { supabase, testConnection } from '../lib/supabase';
import { fetchTasks, createTask, updateTask, deleteTask } from '../services/task.service';
import { useOfflineStatus } from './useOfflineStatus';
import { saveToIndexedDB, getAllFromIndexedDB, getByIdFromIndexedDB, deleteFromIndexedDB, STORES, refreshUserCache } from '../utils/offlineStorage';
import type { Task, NewTask } from '../types/task';

// No extended task type for offline storage
export function useTasks(userId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const isOffline = useOfflineStatus();

  const loadTasks = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // Get user data to check role and section
      const { data: { user } } = await supabase.auth.getUser();
      const userRole = user?.user_metadata?.role;
      const userSectionId = user?.user_metadata?.section_id;

      console.log('[Debug] Loading tasks with user metadata:', {
        userId,
        userRole,
        userSectionId
      });

      if (isOffline) {
        // If offline, show empty state or error message
        console.log('[Debug] Offline mode: No cached data available');
        setTasks([]);
        setError('Offline mode: Cannot fetch tasks while offline.');
      } else {
        // Always fetch fresh data from server, bypassing cache
        console.log('[Debug] Fetching fresh tasks from server');
        
        // Ensure connection is established
        const isConnected = await testConnection();
        if (!isConnected) {
          throw new Error('Unable to connect to database');
        }

        // Always pass sectionId for all user types to ensure section tasks are included
        const data = await fetchTasks(userId, userSectionId);
        
        console.log(`[Debug] Received ${data.length} tasks from server`);
        setTasks(data);
      }
    } catch (err: any) {
      console.error('Error fetching tasks:', err);
      setError(err.message || 'Failed to load tasks');
      
      // Retry with exponential backoff if it's a connection error and we're online
      if (!isOffline && retryCount < 3) {
        const timeout = Math.min(1000 * Math.pow(2, retryCount), 10000);
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
        }, timeout);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, retryCount, isOffline]);

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    // Always force refresh on load
    loadTasks();

    // Set up real-time subscription for tasks updates when online
    if (!isOffline) {
      const subscription = supabase
        .channel('tasks_channel')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${userId}`
        }, () => {
          loadTasks(); // Reload on database changes
        })
        .subscribe();

      // Additional event listener for page visibility changes
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          // Force refresh when the page becomes visible again
          loadTasks();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        subscription.unsubscribe();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [userId, loadTasks, isOffline]);

  // Create a new task - bypass offline storage
  const handleCreateTask = async (newTask: NewTask, sectionId?: string) => {
    if (isOffline) {
      throw new Error('Cannot create tasks while offline. Please connect to the internet and try again.');
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    try {
      const createdTask = await createTask(userId, newTask, sectionId);
      // Update local state with the created task
      setTasks(prev => [...prev, createdTask]);
      return createdTask;
    } catch (err: any) {
      console.error('Error creating task:', err);
      throw err;
    }
  };

  // Update a task - bypass offline storage
  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    if (isOffline) {
      throw new Error('Cannot update tasks while offline. Please connect to the internet and try again.');
    }

    try {
      const updatedTask = await updateTask(taskId, updates);
      
      // Update local state with the updated task
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, ...updatedTask } : task
      ));
      
      return updatedTask;
    } catch (err: any) {
      console.error('Error updating task:', err);
      throw err;
    }
  };

  // Delete a task - bypass offline storage
  const handleDeleteTask = async (taskId: string) => {
    if (isOffline) {
      throw new Error('Cannot delete tasks while offline. Please connect to the internet and try again.');
    }

    try {
      await deleteTask(taskId);
      
      // Update local state by removing the deleted task
      setTasks(prev => prev.filter(task => task.id !== taskId));
      
      return true;
    } catch (err: any) {
      console.error('Error deleting task:', err);
      throw err;
    }
  };

  // Refresh tasks manually
  const refreshTasks = () => {
    if (isOffline) {
      console.log('Cannot refresh tasks while offline');
      return Promise.reject('Cannot refresh tasks while offline');
    }
    return loadTasks();
  };

  // No offline sync function needed
  const syncOfflineChanges = () => {
    console.log('Caching is disabled, no offline changes to sync');
    return Promise.resolve();
  };

  return {
    tasks,
    loading,
    error,
    createTask: handleCreateTask,
    updateTask: handleUpdateTask,
    deleteTask: handleDeleteTask,
    refreshTasks,
    syncOfflineChanges
  };
}

export async function loadTasks(userId: string) {
  try {
    console.log(`[Debug] Loading tasks for user: ${userId}`);
    
    // Get most recent tasks
    const response = await fetchTasks(userId);
    
    console.log(`[Debug] Successfully loaded ${response.length} tasks`);
    return response;
  } catch (error) {
    console.error(`[Error] Failed to load tasks:`, error);
    return [];
  }
}