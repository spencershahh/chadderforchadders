import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth'; // Assuming you have an auth hook
import { toast } from 'react-hot-toast'; // For notifications
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const Settings = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailUpdateLoading, setIsEmailUpdateLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [showEmailUpdate, setShowEmailUpdate] = useState(false);
  
  const [formData, setFormData] = useState({
    email: user?.email || '',
    notifications: {
      email: true,
      streamersLive: true,
      weeklyDigest: true
    }
  });

  const [credits, setCredits] = useState({
    monthly: 0,
    additional: 0
  });

  // Add new state for delete account modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);

  // Fetch credits from Supabase
  useEffect(() => {
    const fetchUserCredits = async () => {
      try {
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !currentUser) throw new Error("Please log in to continue.");

        const { data, error: userError } = await supabase
          .from("users")
          .select("monthly_credits, additional_credits")
          .eq("id", currentUser.id)
          .single();

        if (userError) throw userError;
        if (!data) throw new Error("User data not found.");

        setCredits({
          monthly: data.monthly_credits || 0,
          additional: data.additional_credits || 0,
        });
      } catch (err) {
        console.error("Error fetching user credits:", err.message);
        toast.error("Failed to load credits");
      }
    };

    fetchUserCredits();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await updateUser(formData);
      toast.success('Settings updated successfully');
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailUpdate = async (e) => {
    e.preventDefault();
    setIsEmailUpdateLoading(true);

    try {
      // Update email in Supabase Auth
      const { data, error: authError } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (authError) throw authError;

      // Update email in users table
      const { error: dbError } = await supabase
        .from('users')
        .update({ email: newEmail })
        .eq('id', user.id);

      if (dbError) throw dbError;

      toast.success('Email update verification sent. Please check your new email.');
      setShowEmailUpdate(false);
      setNewEmail('');
    } catch (error) {
      console.error('Error updating email:', error);
      toast.error(error.message);
    } finally {
      setIsEmailUpdateLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmEmail.toLowerCase() !== user?.email?.toLowerCase()) {
      toast.error('Email does not match');
      return;
    }

    setIsDeleting(true);
    try {
      // First delete user data from related tables
      const { error: dbError } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);

      if (dbError) throw dbError;

      // Delete user's auth account using RPC
      const { error: deleteError } = await supabase.rpc('delete_user');
      if (deleteError) throw deleteError;

      // Sign out the user
      await supabase.auth.signOut();
      
      toast.success('Account successfully deleted');
      navigate('/');
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Failed to delete account: ' + error.message);
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const DeleteAccountModal = () => (
    <div className="modal-overlay">
      <div className="modal-content">
        {deleteStep === 1 && (
          <>
            <h2 className="modal-title">Delete Account</h2>
            <div className="modal-message">
              <p>Are you sure you want to delete your account? This action:</p>
              <ul style={{ textAlign: 'left', marginTop: '1rem', marginBottom: '1rem' }}>
                <li>Cannot be undone</li>
                <li>Will delete all your data</li>
                <li>Will remove all your credits</li>
                <li>Will cancel any active subscriptions</li>
              </ul>
            </div>
            <div className="modal-buttons">
              <button 
                className="modal-button secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button 
                className="modal-button primary"
                onClick={() => setDeleteStep(2)}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {deleteStep === 2 && (
          <>
            <h2 className="modal-title">Confirm Deletion</h2>
            <div className="modal-message">
              <p>To confirm deletion, please enter your email address:</p>
              <p className="user-email">{user?.email}</p>
              <input
                type="email"
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                placeholder="Enter your email"
                className="form-input"
                style={{ marginTop: '1rem' }}
              />
            </div>
            <div className="modal-buttons">
              <button 
                className="modal-button secondary"
                onClick={() => {
                  setDeleteStep(1);
                  setDeleteConfirmEmail('');
                }}
              >
                Back
              </button>
              <button 
                className="modal-button danger"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="settings-container">
      <h1 className="settings-header">Settings</h1>

      {/* Credits Section */}
      <div className="settings-section">
        <h2 className="settings-section-header">Your Credits</h2>
        <div className="credits-info">
          <p>Monthly Credits: {credits.monthly} 🪙</p>
          <p>Additional Credits: {credits.additional} 🪙</p>
          <Link to="/credits" className="credits-button">
            Get More Credits 🪙
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Account Section */}
        <section className="settings-section">
          <h2 className="settings-section-header">Account</h2>
          
          {/* Current Email Display */}
          <div className="form-group">
            <label className="form-label">Current Email</label>
            <div className="email-container">
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="form-input"
                style={{ opacity: 0.7 }}
              />
              <button
                type="button"
                onClick={() => setShowEmailUpdate(!showEmailUpdate)}
                className="secondary-button"
              >
                Change Email
              </button>
            </div>
          </div>

          {/* Email Update Form */}
          {showEmailUpdate && (
            <div className="form-group">
              <form onSubmit={handleEmailUpdate}>
                <label className="form-label">New Email Address</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="form-input"
                    placeholder="Enter new email"
                    required
                  />
                  <button
                    type="submit"
                    disabled={isEmailUpdateLoading}
                    className="primary-button"
                  >
                    {isEmailUpdateLoading ? 'Updating...' : 'Update Email'}
                  </button>
                </div>
                <p className="help-text">
                  You'll need to verify your new email address before the change takes effect.
                </p>
              </form>
            </div>
          )}

          {/* Password Change Button */}
          <div className="settings-button-group">
            <button
              type="button"
              onClick={() => {/* Add password change handler */}}
              className="secondary-button"
            >
              Change Password
            </button>
          </div>
        </section>

        {/* Danger Zone Section */}
        <section className="settings-section danger-zone">
          <h2 className="settings-section-header" style={{ color: '#ff4444' }}>Danger Zone</h2>
          <div className="form-group">
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                setShowDeleteModal(true);
                setDeleteStep(1);
                setDeleteConfirmEmail('');
              }}
            >
              Delete Account Permanently
            </button>
            <p className="help-text" style={{ color: '#ff4444', marginTop: '0.5rem' }}>
              Once you delete your account, there is no going back. Please be certain.
            </p>
          </div>
        </section>

        {/* Submit Button */}
        <div style={{ textAlign: 'right', marginTop: '2rem' }}>
          <button
            type="submit"
            disabled={isLoading}
            className="settings-button"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Delete Account Modal */}
      {showDeleteModal && <DeleteAccountModal />}
    </div>
  );
};

export default Settings;