import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { useEffect, useState, lazy, Suspense, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import GlowEffect from './components/GlowEffect';
import Navbar from './components/Navbar';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import TwitchCallback from './pages/TwitchCallback';

// Lazy load pages for better performance
const Discover = lazy(() => import("./pages/Discover"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const StreamPage = lazy(() => import("./pages/StreamPage"));
const Signup = lazy(() => import("./pages/Signup"));
const Login = lazy(() => import("./pages/Login"));
const GemsPage = lazy(() => import('./pages/GemsPage'));
const CreditsPage = lazy(() => import('./pages/CreditsPage'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const DigDeeperPage = lazy(() => import('./pages/DigDeeperPage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'));

import "./App.css";

// Loading component for suspense fallback
const PageLoading = () => (
  <div className="page-loading">
    <div className="loading-spinner"></div>
  </div>
);

// Create a stripe promise outside component
const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

if (!stripeKey) {
  console.error('Stripe publishable key is missing!');
}

// Create context for app initialization status
const APP_INIT_STATE = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const App = () => {
  const [user, setUser] = useState(null);
  const [initState, setInitState] = useState(APP_INIT_STATE.NOT_STARTED);
  const [isLoading, setIsLoading] = useState(true);
  const authListenerRef = useRef(null);
  
  // Memoize logout function to prevent recreating it on every render
  const handleLogout = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  // Initialize app when component mounts
  useEffect(() => {
    const initializeApp = async () => {
      try {
        setInitState(APP_INIT_STATE.IN_PROGRESS);
        setIsLoading(true);
        
        // Try to restore session state first
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error fetching session:', error);
          setInitState(APP_INIT_STATE.FAILED);
          return;
        }
        
        // Set initial user state
        setUser(data?.session?.user || null);
        
        // Set up auth state change listener
        if (authListenerRef.current?.subscription?.unsubscribe) {
          authListenerRef.current.subscription.unsubscribe();
        }
        
        authListenerRef.current = supabase.auth.onAuthStateChange(async (event, session) => {
          // Prevent excessive logging
          if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'TOKEN_REFRESHED'].includes(event)) {
            console.log('Auth state changed in App:', event);
          }
          setUser(session?.user || null);
        });
        
        setInitState(APP_INIT_STATE.COMPLETED);
      } catch (err) {
        console.error('Error in app initialization:', err);
        setInitState(APP_INIT_STATE.FAILED);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();

    // Clean up on unmount
    return () => {
      if (authListenerRef.current?.subscription?.unsubscribe) {
        authListenerRef.current.subscription.unsubscribe();
      }
    };
  }, []);

  // Handle initialization failure
  if (initState === APP_INIT_STATE.FAILED) {
    return (
      <div className="app-error">
        <h2>Failed to start application</h2>
        <p>An error occurred while initializing the app. Please refresh the page.</p>
        <button onClick={() => window.location.reload()}>
          Refresh
        </button>
      </div>
    );
  }

  return (
    <Router>
      <div className="app">
        <GlowEffect />
        <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
        <Navbar user={user} onLogout={handleLogout} />
        {stripePromise ? (
          <Elements stripe={stripePromise}>
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/" element={<Discover />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/stream/:username" element={<StreamPage />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/login" element={<Login />} />
                <Route path="/gems" element={<GemsPage />} />
                <Route path="/credits" element={<CreditsPage />} />
                <Route path="/dig-deeper" element={<DigDeeperPage />} />
                <Route path="/favorites" element={<FavoritesPage />} />
                <Route path="/auth/twitch/callback" element={<TwitchCallback />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                </Route>
              </Routes>
            </Suspense>
          </Elements>
        ) : (
          <div className="stripe-loading">
            <p>Initializing payment system...</p>
          </div>
        )}
      </div>
    </Router>
  );
};

export default App;