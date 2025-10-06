import '../css/EndGamePage.css';
import Leaderboard from "../components/Leaderboard";
import { useLocation, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";


/**
 * Represents the result of a player at the end of the game.
 */
interface PlayerResult {
  name: string;
  points: number;
  correctAnswers: number;
  totalRounds: number;
}

/**
 * EndGamePage - displays the final leaderboard and a button to return to the lobby.
 */
const EndGamePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [ totalRounds, setTotalRounds ] = useState(0);
  const code: string = location.state?.code || '';

  // Extract players from navigation state safely
  const [ players, setPlayers ] = useState<PlayerResult[]>([]);

  // Format player data for Leaderboard: "correctAnswers / totalRounds"
  const formattedPlayers = players.map((p) => ({
    name: p.name,
    points: p.points,
    scoreDetail: `${p.correctAnswers}/${totalRounds}`,
  }));

  // Navigate back to the lobby screen
  const handleBackToLobby = (): void => {
    navigate("/lobby");
  };

    /* ----------------- SOCKET CONNECTION ----------------- */
  useEffect(() => {
    const socketUrl = "http://localhost:8080"; // import.meta.env.VITE_SOCKET_URL || 
    const newSocket = io(socketUrl);

    newSocket.on("connect", () => {

      newSocket.emit("get-room-players-scores", code );
      newSocket.emit("get-total-rounds", code );

      // Listen for players joined the room
      newSocket.on("room-players-scores", ( playerScores ) => {
        setPlayers(playerScores);
      });
    })

    // Get total rounds from game settings
    newSocket.on("total-rounds", (totalRounds: number) => {
      setTotalRounds(totalRounds);
    });

  }, [ code ]);

  return (
    <div className="end-game-container">
      {/* Leaderboard with final scores */}
      <Leaderboard players={formattedPlayers} />

      {/* Navigation button */}
      <div className="end-game-button">
        <button className="back-button" onClick={handleBackToLobby}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
};

export default EndGamePage;