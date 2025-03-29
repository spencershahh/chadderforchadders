import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { toast, Toaster } from 'react-hot-toast';
import "../App.css";

// Rate limiting configuration
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes
const loginAttempts = {};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Check for rate limiting
  const checkRateLimit = (email) => {
    const now = Date.now();
    
    if (loginAttempts[email]) {
      if (loginAttempts[email].count >= MAX_ATTEMPTS && 
          now - loginAttempts[email].timestamp < LOCKOUT_TIME) {
        // Account is temporarily locked
        const remainingTime = Math.ceil((LOCKOUT_TIME - (now - loginAttempts[email].timestamp)) / 60000);
        toast.error(`Too many login attempts. Please try again in ${remainingTime} minutes.`);
        return false;
      }
      
      // Reset attempts if lockout period has passed
      if (now - loginAttempts[email].timestamp >= LOCKOUT_TIME) {
        delete loginAttempts[email];
      }
    }
    
    return true;
  };
  
  // Record a failed login attempt
  const recordFailedAttempt = (email) => {
    const now = Date.now();
    
    if (!loginAttempts[email]) {
      loginAttempts[email] = { count: 1, timestamp: now };
    } else {
      loginAttempts[email].count += 1;
      loginAttempts[email].timestamp = now;
    }
    
    console.log(`Failed login attempt for ${email}. Attempts: ${loginAttempts[email].count}`);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check rate limiting first
      if (!checkRateLimit(email)) {
        setLoading(false);
        return;
      }
      
      // Log in the user
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Record failed attempt for rate limiting
        recordFailedAttempt(email);
        
        toast.error(`Login error: ${error.message}`);
        setLoading(false);
        return;
      }

      // Reset login attempts on success
      if (loginAttempts[email]) {
        delete loginAttempts[email];
      }

      if (data.session) {
        // Store the session in localStorage for persistence
        localStorage.setItem('authSession', JSON.stringify(data.session));
        
        toast.success('Login successful!', {
          duration: 3000,
        });
        
        navigate("/"); // Redirect user to home or dashboard
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error(`Unexpected error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Cleanup function to run when component unmounts
  useEffect(() => {
    return () => {
      // No cleanup needed for this component
    };
  }, []);

  return (
    <div className="auth-container">
      <Toaster position="top-center" />
      <h2 className="auth-title">Log in to Chadder.ai</h2>
      <form className="auth-form" onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="auth-input"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="auth-input"
        />
        <button type="submit" disabled={loading} className="auth-button">
          {loading ? "Logging in..." : "Log In"}
        </button>
      </form>
      <p className="auth-switch">
        Don't have an account? <a href="/signup">Sign Up</a>
      </p>
    </div>
  );
};

export default Login;