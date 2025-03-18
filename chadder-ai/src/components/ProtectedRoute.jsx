import { Navigate, Outlet } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const ProtectedRoute = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const authSubscriptionRef = useRef(null);
  
  // Fast authentication check
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // If auth check is taking too long, show loading UI
      if (!authChecked) {
        setIsLoading(true);
      }
    }, 300); // Wait 300ms before showing loading UI to avoid flashing
    
    return () => clearTimeout(timeoutId);
  }, [authChecked]);

  useEffect(() => {
    // Flag to prevent state updates after unmount
    let isMounted = true;
    
    const checkAuth = async () => {
      try {
        // Try to get session from local storage first for instant check
        const localSession = localStorage.getItem('supabase.auth.token');
        const hasLocalSession = localSession && JSON.parse(localSession)?.currentSession;
        
        if (hasLocalSession && isMounted) {
          // Temporarily set authenticated based on local session
          // This allows fast rendering while we validate with server
          setIsAuthenticated(true);
          setIsLoading(false);
        }
        
        // Now do the actual server check
        const { data: { session } } = await supabase.auth.getSession();
        
        if (isMounted) {
          // Update with real authenticated state
          setIsAuthenticated(!!session?.user);
          setAuthChecked(true);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        if (isMounted) {
          setIsAuthenticated(false);
          setAuthChecked(true);
          setIsLoading(false);
        }
      }
    };

    // Set up auth state listener with connection recovery
    const setupAuthListener = () => {
      if (authSubscriptionRef.current?.subscription?.unsubscribe) {
        authSubscriptionRef.current.subscription.unsubscribe();
      }
      
      authSubscriptionRef.current = supabase.auth.onAuthStateChange((_event, session) => {
        if (isMounted) {
          console.log('Auth state changed in protected route:', !!session?.user);
          setIsAuthenticated(!!session?.user);
          setAuthChecked(true);
          setIsLoading(false);
        }
      });
    };

    checkAuth();
    setupAuthListener();
    
    // Network status listener for auth recovery
    const handleOnline = () => {
      console.log('Connection restored - rechecking auth');
      setupAuthListener();
      checkAuth();
    };
    
    window.addEventListener('online', handleOnline);

    // Cleanup subscription
    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      
      if (authSubscriptionRef.current?.subscription?.unsubscribe) {
        authSubscriptionRef.current.subscription.unsubscribe();
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="loading-container" style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: '#0d0d0d'
      }}>
        <div className="loading-spinner" style={{
          width: '50px',
          height: '50px',
          border: '5px solid #333',
          borderTop: '5px solid #fff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Save the current URL so we can redirect back after login
    const currentPath = window.location.pathname;
    if (currentPath !== '/login') {
      sessionStorage.setItem('redirectAfterLogin', currentPath);
    }
    
    return <Navigate to="/login" replace />;
  }

  // For React Router v6, use Outlet instead of returning children
  return <Outlet />;
};

export default ProtectedRoute; 