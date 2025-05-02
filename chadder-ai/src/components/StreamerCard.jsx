import PropTypes from "prop-types";

const StreamerCard = ({ streamer }) => {
  // Early validation - if streamer is null/undefined, return nothing
  if (!streamer) {
    console.error('StreamerCard received null/undefined streamer data');
    return null;
  }

  // Safely destructure with default values for all properties
  const { 
    user_name = 'Unknown Streamer', 
    user_login = '',
    thumbnail_url = '', 
    type = 'offline', 
    title = 'No title available', 
    viewer_count = 0 
  } = streamer;

  // Generate safe Twitch URL
  const twitchUrl = `https://www.twitch.tv/${user_login || user_name}`;
  
  // Handle thumbnail URL safely
  const getThumbnailUrl = () => {
    if (!thumbnail_url) return null;
    
    try {
      return thumbnail_url
        .replace("{width}", "320")
        .replace("{height}", "180");
    } catch (error) {
      console.error('Error formatting thumbnail URL:', error);
      return null;
    }
  };

  const safeThumbUrl = getThumbnailUrl();

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg shadow-md">
      <a
        href={twitchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {type === "live" && safeThumbUrl ? (
          <img
            src={safeThumbUrl}
            alt={`${user_name}'s stream`}
            className="rounded-lg w-full"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = "https://via.placeholder.com/320x180/1a1a2e/FFFFFF?text=Stream+Unavailable";
            }}
          />
        ) : (
          <div className="bg-gray-700 h-32 flex items-center justify-center rounded-lg">
            <p>{type === "live" ? "Stream Unavailable" : "Offline"}</p>
          </div>
        )}
      </a>
      <h2 className="font-bold text-lg mt-2">
        <a
          href={twitchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white hover:underline"
        >
          {user_name}
        </a>
      </h2>
      <p className="text-gray-400">{title}</p>
      {type === "live" && <p>Viewers: {viewer_count.toLocaleString()}</p>}
    </div>
  );
};

StreamerCard.propTypes = {
  streamer: PropTypes.shape({
    user_name: PropTypes.string,
    user_login: PropTypes.string,
    thumbnail_url: PropTypes.string,
    type: PropTypes.string,
    title: PropTypes.string,
    viewer_count: PropTypes.number,
  })
};

export default StreamerCard;