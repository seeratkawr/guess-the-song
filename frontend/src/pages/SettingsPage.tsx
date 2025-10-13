import Settings from "../components/Settings";
import "../css/SettingsPage.css";
import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import CopyButton from "../components/CopyButton";

const SettingsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Retrieve player name from previous page (fallback: "You")
  const playerName = location.state?.playerName || "You";

  // Game settings state (default values)
  const [settings, setSettings] = useState({
    players: "Single Player",
    guessType: "Guess Song",
    gameMode: "Single Song",
    rounds: "10 Rounds",
    guessTime: "15 sec",
  });

  // Navigate back to lobby
  const handleBackClick = () => {
    navigate("/lobby");
  };

  // Placeholder for invite code logic (copy/share)
  const handleGameCodeClick = () => {};

  // Create room and move to game page, passing player info and settings
  const handleCreateRoom = () => {
    navigate("/game", { state: { ...settings, playerName } });
  };

  return (
    <div className="settings-page-container">
      <div className="gradient">
        <button className="joinroom-back-button" onClick={handleBackClick}>
          <span className="back-arrow">&lt;&lt;</span>
          <span className="back-text">Back</span>
        </button>

        <h1 className="settings-page-title">Guessify</h1>

        <div className="room-code-section">
          <h2>Invite Code: {code}</h2>
          <CopyButton textToCopy={code || ""} />
        </div>
      </div>

      {/* Settings content */}
      <div className="settings-content">
        {/* Game settings form */}
        <Settings settings={settings} setSettings={setSettings} />

        {/* Button to confirm settings and start game */}
        <div className="create-room-section">
          <button className="create-room-button" onClick={handleCreateRoom}>
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
