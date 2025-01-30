import PropTypes from 'prop-types';

const SortDropdown = ({ sortOption, setSortOption }) => {
  return (
    <div className="mb-6 flex gap-4 items-center">
      <label htmlFor="sortOption" className="text-gray-400 font-semibold">
        Sort by:
      </label>
      <select
        id="sortOption"
        className="bg-gray-800 text-white px-4 py-2 rounded-lg"
        value={sortOption}
        onChange={(e) => setSortOption(e.target.value)}
      >
        <option value="online">Online/Offline</option>
        <option value="viewerCount">Viewer Count</option>
        <option value="alphabetical">Alphabetical</option>
      </select>
    </div>
  );
};

SortDropdown.propTypes = {
  sortOption: PropTypes.string.isRequired,
  setSortOption: PropTypes.func.isRequired,
};

export default SortDropdown;