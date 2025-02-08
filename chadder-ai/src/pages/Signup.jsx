import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { toast, Toaster } from 'react-hot-toast';
import "../App.css";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const checkExistingUser = async (email) => {
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
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check for existing user first
      const existingUser = await checkExistingUser(email);
      if (existingUser) {
        // Try to delete the existing user record
        const { error: deleteError } = await supabase
          .from('users')
          .delete()
          .eq('id', existingUser.id);

        if (deleteError) {
          console.error("Error deleting existing user:", deleteError);
          toast.error('Error creating account. Please try again later.');
          setLoading(false);
          return;
        }
      }

      // Validate display name
      if (!displayName.trim()) {
        toast.error('Display name is required');
        setLoading(false);
        return;
      }

      // Check if display name is available using our new function
      const { data: isAvailable, error: checkError } = await supabase
        .rpc('is_username_available', {
          p_display_name: displayName
        });

      if (checkError) {
        toast.error(`Error checking display name: ${checkError.message}`);
        setLoading(false);
        return;
      }

      if (!isAvailable) {
        toast.error('Display name is not available');
        setLoading(false);
        return;
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
        // First try to delete any existing record with this ID
        const { error: deleteError } = await supabase
          .from('users')
          .delete()
          .eq('id', user.id);

        if (deleteError) {
          console.error("Error deleting existing user:", deleteError);
        }

        // Insert the user into the users table
        const { error: dbError } = await supabase
          .from('users')
          .insert([
            {
              id: user.id,
              email: user.email,
              display_name: displayName,
              tier: 'free',
              credits: 0,
              created_at: new Date().toISOString()
            }
          ]);

        if (dbError) {
          console.error("Database insert error:", dbError);
          toast.error(`Database error saving new user: ${dbError.message}`);
          
          // If insert fails, try to clean up the auth user
          const { error: cleanupError } = await supabase.auth.admin.deleteUser(user.id);
          if (cleanupError) {
            console.error("Error cleaning up auth user:", cleanupError);
          }
          return;
        }

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

  return (
    <div className="auth-container">
      <Toaster position="top-center" />
      <h2 className="auth-title">Sign Up for Chadder.ai</h2>
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
        <button type="submit" disabled={loading} className="auth-button">
          {loading ? "Signing up..." : "Sign Up"}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <a href="/login">Log in</a>
      </p>
    </div>
  );
};

export default Signup;