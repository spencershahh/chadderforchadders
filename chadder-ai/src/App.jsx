import { BrowserRouter as Router, Routes, Route, Link, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import GlowEffect from './components/GlowEffect';
import Navbar from './components/Navbar';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import TwitchCallback from './pages/TwitchCallback';
import { AuthProvider } from './hooks/AuthProvider';
import { GamificationProvider } from './hooks/GamificationProvider';

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

const App = () => {
  return (
    <Router>
      <div className="app">
        <GlowEffect />
        <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
        <AuthProvider>
          <GamificationProvider>
            <Navbar />
            {stripePromise ? (
              <Elements stripe={stripePromise}>
                <Suspense fallback={<PageLoading />}>
                  <Routes>
                    <Route path="/" element={<Discover />} />
                    <Route path="/leaderboard" element={<Leaderboard />} />
                    <Route path="/stream/:username" element={<StreamPage />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/gems" element={<Navigate to="/credits" replace />} />
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
          </GamificationProvider>
        </AuthProvider>
      </div>
    </Router>
  );
};

export default App;