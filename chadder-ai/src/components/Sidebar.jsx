import { NavLink } from "react-router-dom";

const Sidebar = () => {
  return (
    <div className="sidebar">
      <div>
        <h2>Chadder.ai</h2>
        <nav>
          <NavLink
            to="/"
            className={({ isActive }) =>
              `block ${isActive ? "active" : ""}`
            }
          >
            Discover
          </NavLink>
          <NavLink
            to="/leaderboard"
            className={({ isActive }) =>
              `block ${isActive ? "active" : ""}`
            }
          >
            Leaderboard
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `block ${isActive ? "active" : ""}`
            }
          >
            Profile
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `block ${isActive ? "active" : ""}`
            }
          >
            Settings
          </NavLink>
        </nav>
      </div>
    </div>
  );
};

export default Sidebar;