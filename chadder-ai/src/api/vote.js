// Temporary in-memory vote storage
const votes = {};

// Function to add a vote for a streamer
export const voteForStreamer = (username) => {
  if (!votes[username]) {
    votes[username] = 1;
  } else {
    votes[username] += 1;
  }
};

// Function to get all votes
export const getVotes = () => {
  return votes;
};