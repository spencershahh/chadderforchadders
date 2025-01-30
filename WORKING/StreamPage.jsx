import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const StreamPage = () => {
  const { username } = useParams();
  const [voteStats, setVoteStats] = useState({ today: 0, week: 0, allTime: 0 });
  const [credits, setCredits] = useState({ monthly: 0, additional: 0 });
  const [selectedAmount, setSelectedAmount] = useState(1);
  const [userIp, setUserIp] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserCredits();
    fetchVoteStats();
    getUserIP();

    const embedStream = () => {
      if (window.Twitch && window.Twitch.Embed) {
        new window.Twitch.Embed("twitch-embed", {
          width: "100%",
          height: "480",
          channel: username.toLowerCase(),
          layout: "video",
          autoplay: true,
          parent: ["localhost"],
        });
      }
    };

    if (!document.getElementById("twitch-embed-script")) {
      const script = document.createElement("script");
      script.setAttribute("src", "https://player.twitch.tv/js/embed/v1.js");
      script.setAttribute("async", true);
      script.setAttribute("id", "twitch-embed-script");
      document.body.appendChild(script);

      script.onload = embedStream;
    } else {
      embedStream();
    }
  }, [username]);

  const fetchUserCredits = async () => {
    setLoading(true);
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) throw new Error("Please log in to continue.");

      const { data, error: userError } = await supabase
        .from("users")
        .select("monthly_credits, additional_credits")
        .eq("id", user.id)
        .single();

      if (userError) throw new Error(userError.message);
      if (!data) throw new Error("User data not found.");

      setCredits({
        monthly: data.monthly_credits || 0,
        additional: data.additional_credits || 0,
      });
    } catch (err) {
      console.error("Error fetching user credits:", err.message);
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchVoteStats = async () => {
    try {
      const { data, error } = await supabase
        .from("votes")
        .select("vote_amount, created_at")
        .eq("streamer", username.toLowerCase());

      if (error) throw error;

      const today = new Date();
      const startOfToday = new Date(today.setHours(0, 0, 0, 0));
      const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));

      let todayVotes = 0, weekVotes = 0, allTimeVotes = 0;

      data.forEach((vote) => {
        const voteDate = new Date(vote.created_at);
        allTimeVotes += vote.vote_amount;
        if (voteDate >= startOfToday) todayVotes += vote.vote_amount;
        if (voteDate >= startOfWeek) weekVotes += vote.vote_amount;
      });

      setVoteStats({ today: todayVotes, week: weekVotes, allTime: allTimeVotes });
    } catch (err) {
      console.error("Error fetching vote stats:", err.message);
    }
  };

  const getUserIP = async () => {
    try {
      const res = await fetch("https://api64.ipify.org?format=json");
      const data = await res.json();
      setUserIp(data.ip);
    } catch (error) {
      console.error("Error fetching IP address:", error);
    }
  };

  return (
    <div className="stream-page">
      <h2 className="stream-title">Watching {username}&apos;s Stream</h2>

      <div className="stream-content">
        <div id="twitch-embed" className="stream-video"></div>

        <iframe
          src={`https://www.twitch.tv/embed/${username}/chat?parent=localhost`}
          height="480"
          width="350"
          frameBorder="0"
          scrolling="no"
          title={`${username} chat`}
          className="stream-chat"
        ></iframe>
      </div>

      <div className="vote-stats" style={{ textAlign: "center", marginTop: "20px" }}>
        <h3>Vote Statistics</h3>
        <table style={{ width: "50%", margin: "0 auto", borderCollapse: "collapse", color: "#fff" }}>
          <thead>
            <tr style={{ backgroundColor: "#4CAF50" }}>
              <th style={{ padding: "10px", border: "1px solid #fff" }}>Votes Today</th>
              <th style={{ padding: "10px", border: "1px solid #fff" }}>Votes This Week</th>
              <th style={{ padding: "10px", border: "1px solid #fff" }}>All Time Votes</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ backgroundColor: "#222" }}>
              <td style={{ padding: "10px", border: "1px solid #fff" }}>{voteStats.today}</td>
              <td style={{ padding: "10px", border: "1px solid #fff" }}>{voteStats.week}</td>
              <td style={{ padding: "10px", border: "1px solid #fff" }}>{voteStats.allTime}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="vote-options">
        <h3>Select Vote Amount:</h3>
        <div className="vote-buttons">
          {[1, 5, 10, 25, 50].map((amount) => (
            <button
              key={amount}
              className={`vote-amount-button ${selectedAmount === amount ? "selected" : ""}`}
              onClick={() => setSelectedAmount(amount)}
            >
              {amount} 🪙
            </button>
          ))}
        </div>

        <button className="vote-button" disabled={loading}>
          {loading ? "Submitting Vote..." : `👍 Vote with ${selectedAmount} Credits`}
        </button>

        <p className="credit-balance">
          {loading
            ? "Loading..."
            : errorMessage
            ? `Error: ${errorMessage}`
            : `Monthly Balance: ${credits.monthly} 🪙 | Additional Balance: ${credits.additional} 🪙`}
        </p>
      </div>
    </div>
  );
};

export default StreamPage;
