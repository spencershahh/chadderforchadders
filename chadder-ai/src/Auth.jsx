import { useState } from "react";
import { supabase } from "./supabaseClient";

// Rate limiting configuration
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes
const loginAttempts = {};

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Check for rate limiting
  const checkRateLimit = (email) => {
    if (!isSignUp) { // Only apply rate limiting to login attempts
      const now = Date.now();
      
      if (loginAttempts[email]) {
        if (loginAttempts[email].count >= MAX_ATTEMPTS && 
            now - loginAttempts[email].timestamp < LOCKOUT_TIME) {
          // Account is temporarily locked
          const remainingTime = Math.ceil((LOCKOUT_TIME - (now - loginAttempts[email].timestamp)) / 60000);
          setError(`Too many login attempts. Please try again in ${remainingTime} minutes.`);
          return false;
        }
        
        // Reset attempts if lockout period has passed
        if (now - loginAttempts[email].timestamp >= LOCKOUT_TIME) {
          delete loginAttempts[email];
        }
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

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Basic validation
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    // Check rate limit for login attempts
    if (!checkRateLimit(email)) {
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        // Sign up flow
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`
          }
        });

        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }

        if (data?.user) {
          setVerificationSent(true);
          setError("");
        }
      } else {
        // Login flow
        const { data, error } = await supabase.auth.signInWithPassword({ 
          email, 
          password 
        });

        if (error) {
          // Record failed login attempt
          recordFailedAttempt(email);
          setError(error.message);
          setLoading(false);
          return;
        }

        if (data?.session) {
          // Store session for persistence
          localStorage.setItem('authSession', JSON.stringify(data.session));
          
          // Reset login attempts on successful login
          if (loginAttempts[email]) {
            delete loginAttempts[email];
          }
          
          setError("");
        }
      }
    } catch (error) {
      console.error("Authentication error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>{isSignUp ? "Sign Up" : "Login"}</h2>
      
      {verificationSent ? (
        <div className="verification-message">
          <p>We've sent a verification email to <strong>{email}</strong>.</p>
          <p>Please check your inbox and click the link to complete your registration.</p>
          <button
            onClick={() => setIsSignUp(false)}
            style={{ marginTop: '20px' }}
          >
            Go to Login
          </button>
        </div>
      ) : (
        <>
          {error && <p style={{ color: "red" }}>{error}</p>}
          
          <form onSubmit={handleAuth}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? (isSignUp ? "Signing Up..." : "Logging In...") : (isSignUp ? "Sign Up" : "Login")}
            </button>
          </form>
          
          <button 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
            }}
            disabled={loading}
          >
            {isSignUp ? "Already have an account? Login" : "Don't have an account? Sign Up"}
          </button>
        </>
      )}
    </div>
  );
};

export default Auth;