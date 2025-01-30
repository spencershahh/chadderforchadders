import PropTypes from "prop-types";

const StreamerCard = ({ streamer }) => {
  const { user_name, thumbnail_url, type, title, viewer_count } = streamer;

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg shadow-md">
      <a
        href={`https://www.twitch.tv/${user_name}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {type === "live" ? (
          <img
            src={thumbnail_url.replace("{width}", "320").replace("{height}", "180")}
            alt={`${user_name}'s stream`}
            className="rounded-lg w-full"
          />
        ) : (
          <div className="bg-gray-700 h-32 flex items-center justify-center rounded-lg">
            <p>Offline</p>
          </div>
        )}
      </a>
      <h2 className="font-bold text-lg mt-2">
        <a
          href={`https://www.twitch.tv/${user_name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white hover:underline"
        >
          {user_name}
        </a>
      </h2>
      <p className="text-gray-400">{title || "No title available"}</p>
      {type === "live" && <p>Viewers: {viewer_count}</p>}
    </div>
  );
};

StreamerCard.propTypes = {
  streamer: PropTypes.shape({
    user_name: PropTypes.string.isRequired,
    thumbnail_url: PropTypes.string.isRequired,
    type: PropTypes.string,
    title: PropTypes.string,
    viewer_count: PropTypes.number,
  }).isRequired,
};

export default StreamerCard;