import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { toast, Toaster } from 'react-hot-toast';
import "../App.css";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const navigate = useNavigate();

  // Check if a user exists with the given email
  const checkExistingUser = async (email) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', email)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 means no rows returned
        console.error("Error checking existing user:", error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error("Unexpected error checking user:", error);
      return null;
    }
  };

  // Check if a display name is available
  const checkDisplayNameAvailability = async (displayName) => {
    try {
      const { data: isAvailable, error } = await supabase
        .rpc('is_username_available', {
          p_display_name: displayName
        });

      if (error) {
        console.error("Error checking display name:", error);
        return { available: false, error: error.message };
      }

      return { available: isAvailable, error: null };
    } catch (error) {
      console.error("Unexpected error checking display name:", error);
      return { available: false, error: error.message };
    }
  };

  // Handle email verification
  const sendVerificationEmail = async (email) => {
    try {
      const siteUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${siteUrl}/auth/callback`
        }
      });

      if (error) {
        console.error("Error sending verification email:", error);
        return { success: false, error: error.message };
      }
      
      return { success: true, error: null };
    } catch (error) {
      console.error("Unexpected error sending verification:", error);
      return { success: false, error: error.message };
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Basic validation
      if (!displayName.trim()) {
        toast.error('Display name is required');
        setLoading(false);
        return;
      }

      if (password.length < 6) {
        toast.error('Password must be at least 6 characters');
        setLoading(false);
        return;
      }

      // Check if display name is available
      const { available, error: nameError } = await checkDisplayNameAvailability(displayName);
      
      if (nameError) {
        toast.error(`Error checking display name: ${nameError}`);
        setLoading(false);
        return;
      }

      if (!available) {
        toast.error('Display name is not available');
        setLoading(false);
        return;
      }

      // Check for existing user with this email in the database
      const existingUser = await checkExistingUser(email);
      
      if (existingUser) {
        // In a real production app, you might not want to delete users but instead
        // handle this case differently, like asking them to login or reset password
        const { error: deleteError } = await supabase
          .from('users')
          .delete()
          .eq('id', existingUser.id);
          
        if (deleteError) {
          console.error("Error removing existing user:", deleteError);
          toast.error("An error occurred. Please try again or use a different email.");
          setLoading(false);
          return;
        }
      }

      // Get site URL for email confirmation
      const siteUrl = import.meta.env.VITE_APP_URL || window.location.origin;

      // Sign up the user with Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName
          },
          emailRedirectTo: `${siteUrl}/login`
        }
      });

      if (error) {
        console.error("Signup error:", error.message);
        toast.error(`Signup error: ${error.message}`);
        setLoading(false);
        return;
      }

      const user = data.user;
      console.log("Supabase auth signup response:", data);

      if (user) {
        // Wait a short moment to ensure any cascading deletes have completed
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Try upserting the new user record to avoid duplicate key error if record exists
        const { error: upsertError } = await supabase
          .from('users')
          .upsert([
            {
              id: user.id,
              email: user.email,
              display_name: displayName,
              tier: 'free-tier',
              gem_balance: 0,
              created_at: new Date().toISOString()
            }
          ], { onConflict: 'id' });

        if (upsertError) {
          console.error("Database upsert error:", upsertError);
          toast.error(`Failed to create account: ${upsertError.message}`);
          setLoading(false);
          return;
        }

        setVerificationSent(true);
        toast.success('Signup successful! Please check your email to confirm your account.', {
          duration: 5000,
          onClose: () => navigate("/login")
        });
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(`Unexpected error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Cleanup function when component unmounts
  useEffect(() => {
    return () => {
      // Any cleanup if needed
    };
  }, []);

  return (
    <div className="auth-container">
      <Toaster position="top-center" />
      <h2 className="auth-title">Sign Up for Chadder.ai</h2>

      {verificationSent ? (
        <div className="verification-message">
          <p>We've sent a verification email to <strong>{email}</strong>.</p>
          <p>Please check your inbox and click the link to complete your registration.</p>
          <button 
            onClick={() => navigate("/login")} 
            className="auth-button"
            style={{ marginTop: '20px' }}
          >
            Go to Login
          </button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSignup}>
          <input
            type="text"
            placeholder="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="auth-input"
          />
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
          <p className="terms-text" style={{ fontSize: '0.8rem', color: '#a8a8a8', marginBottom: '1rem', textAlign: 'center' }}>
            By signing up, you agree to our{' '}
            <a href="https://www.chadder.ai/Terms" target="_blank" rel="noopener noreferrer" style={{ color: '#9147ff' }}>
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="https://www.chadder.ai/Privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#9147ff' }}>
              Privacy Policy
            </a>
          </p>
          <button type="submit" disabled={loading} className="auth-button">
            {loading ? "Signing up..." : "Sign Up"}
          </button>
        </form>
      )}

      <p className="auth-switch">
        Already have an account? <a href="/login">Log in</a>
      </p>
    </div>
  );
};

export default Signup;