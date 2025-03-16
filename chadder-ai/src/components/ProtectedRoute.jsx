import { Navigate, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ProtectedRoute = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    let authSubscription;

    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
          setIsAuthenticated(!!session?.user);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        if (mounted) {
          setIsAuthenticated(false);
          setIsLoading(false);
        }
      }
    };

    // Set up auth state listener
    authSubscription = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        console.log('Auth state changed in protected route:', !!session?.user);
        setIsAuthenticated(!!session?.user);
        setIsLoading(false);
      }
    });

    checkAuth();

    // Cleanup subscription
    return () => {
      setMounted(false);
      if (authSubscription && authSubscription.data && authSubscription.data.subscription) {
        authSubscription.data.subscription.unsubscribe();
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
    console.log('User not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  // For React Router v6, use Outlet instead of returning children
  return <Outlet />;
};

export default ProtectedRoute; 