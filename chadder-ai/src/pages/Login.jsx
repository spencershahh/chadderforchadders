import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useLocation } from "react-router-dom";
import { toast, Toaster } from 'react-hot-toast';
import "../App.css";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we have a return path in the location state
  const returnTo = location.state?.returnTo || "/";

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Log in the user
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(`Login error: ${error.message}`);
        setLoading(false);
        return;
      }

      if (data.session) {
        // Check if the user is an admin
        const userId = data.session.user.id;
        
        const { data: adminData, error: adminError } = await supabase
          .from('admins')
          .select('*')
          .eq('user_id', userId)
          .single();
        
        toast.success('Login successful!', {
          duration: 3000,
        });
        
        // Redirect admin users to the admin dashboard
        if (!adminError && adminData) {
          navigate("/admin");
        } 
        // If we have a returnTo path, use that
        else if (returnTo && returnTo !== "/") {
          navigate(returnTo);
        }
        // Otherwise go to home
        else {
          navigate("/");
        }
      }
    } catch (error) {
      console.error("Error during login:", error);
      toast.error("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

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