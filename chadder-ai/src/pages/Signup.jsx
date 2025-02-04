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

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate display name
      if (!displayName.trim()) {
        toast.error('Display name is required');
        setLoading(false);
        return;
      }

      // Check if display name is already taken
      const { data: existingUsers, error: checkError } = await supabase
        .from('users')
        .select('display_name')
        .eq('display_name', displayName);

      if (checkError) {
        toast.error(`Error checking display name: ${checkError.message}`);
        setLoading(false);
        return;
      }

      if (existingUsers?.length > 0) {
        toast.error('Display name is already taken');
        setLoading(false);
        return;
      }

      console.log("Signing up user:", email);

      // Sign up the user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        console.error("Signup error:", error.message);
        toast.error(`Signup error: ${error.message}`);
        setLoading(false);
        return;
      }

      const user = data.user;
      console.log("Supabase auth signup response:", data);

      // Insert the user into the 'users' table (corrected table name)
      if (user) {
        const { error: dbError } = await supabase
          .from("users")
          .insert({
            id: user.id,
            email: user.email,
            display_name: displayName,
            tier: "free",
            credits: 0,
          });

        if (dbError) {
          console.error("Database insert error:", dbError.message);
          toast.error(`Database error saving new user: ${dbError.message}`);
          return;
        }

        // Show single notification and navigate
        toast.success('Signup successful! Please check your email to confirm.', {
          duration: 5000,
          onClose: () => navigate("/login")
        });
      }
    } catch (err) {
      console.error("Unexpected error:", err.message);
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