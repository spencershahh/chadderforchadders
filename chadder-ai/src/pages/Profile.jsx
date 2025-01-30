import { Link } from 'react-router-dom';

const Profile = () => {
  return (
    <div className="flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-6">Your Profile</h1>
      <p className="text-gray-600">
        Manage your favorites, nominations, and account settings.
      </p>
      <div className="profile-credits-section">
        <h3>Your Credits</h3>
        <p>Monthly Credits: {credits.monthly} 🪙</p>
        <p>Additional Credits: {credits.additional} 🪙</p>
        <Link to="/credits" className="credits-button">
          Get More Credits 🪙
        </Link>
      </div>
      {/* Profile content will go here */}
    </div>
  );
};

export default Profile;