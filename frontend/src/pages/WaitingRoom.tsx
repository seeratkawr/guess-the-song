import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { socket } from "../socket";
import CopyButton from "../components/CopyButton";
import Avatar1 from "../assets/avatars/avatar1.png";
import Avatar2 from "../assets/avatars/avatar2.png";
import Avatar3 from "../assets/avatars/avatar3.png";
import defaultAvatar from "../assets/avatars/avatar1.png";
import "../css/WaitingRoom.css";

interface PlayerObj {
  name: string;
  points?: number;
  previousPoints?: number;
  correctAnswers?: number;
  avatar?: { id?: string; color?: string } | string;
}

const WaitingRoom: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { code } = useParams<{ code: string }>();

  const state = location.state as {
    playerName?: string;
    isHost?: boolean;
    socketId?: string;
  };

  const playerName = state?.playerName || "Player";
  const isHost = state?.isHost || false;

  const [players, setPlayers] = useState<PlayerObj[]>([]);
  const [amountOfPlayersInRoom, setAmountOfPlayersInRoom] = useState(0);

  // If a player joins mid-round, keep them in this waiting room and show banner
  const [activeGameInfo, setActiveGameInfo] = useState<any | null>(null);
  // Keep a ref so socket handlers always use the latest settings
  const activeGameInfoRef = useRef<any | null>(null);

  useEffect(() => {
    if (!socket?.connected) return;

    const avatarId = localStorage.getItem("avatarId") || "a1";
    const avatarColor = localStorage.getItem("avatarColor") || "#FFD166";
    socket.emit("join", {
      code,
      playerName,
      avatar: { id: avatarId, color: avatarColor },
    });

    socket.on("join-error", ({ message }) => {
      alert(message);
      navigate("/lobby", { state: { playerName } });
    });

    // Handle successful join
    socket.on("join-success", ({ playerScores, amountOfPlayersInRoom }) => {
      // server sends full player score objects; use them to render avatars and names
      if (Array.isArray(playerScores)) {
        setPlayers(playerScores);
      }
      setAmountOfPlayersInRoom(amountOfPlayersInRoom);
    });

    // Handle player disconnections
    socket.on(
      "players-updated",
      ({ players: updatedPlayers, playerScores, newHost }) => {
        console.log("Players updated due to disconnect:", updatedPlayers);

        if (Array.isArray(playerScores)) {
          setPlayers(playerScores);
        } else if (Array.isArray(updatedPlayers)) {
          // Fallback to simple player names if scores not available
          setPlayers(updatedPlayers.map((name) => ({ name })));
        }

        // Handle host transfer
        if (newHost && newHost !== playerName && !isHost) {
          // This player is not the new host, but someone else became host
          console.log(`${newHost} is now the host`);
        } else if (newHost === playerName && !isHost) {
          // This player became the new host
          console.log("You are now the host!");
          // You might want to update local state or show a notification
        }
      }
    );

    // Add this handler for joining active games
    socket.on("join-active-game", (gameSettings) => {
      // If a round is active, keep the joining client in the waiting room and show banner.
      // Store the full game settings so we can merge them with subsequent round events.
      if (gameSettings?.isRoundActive) {
        setActiveGameInfo(gameSettings);
        activeGameInfoRef.current = gameSettings;
      } else {
        // If not mid-round, navigate straight into the room with full settings
        navigate(`/room/${code}`, {
          state: {
            ...gameSettings,
            playerName,
            isHost: false,
          },
        });
      }
    });

    socket.on("game-started", (settings) => {
      navigate(`/room/${code}`, {
        state: {
          ...settings,
          playerName,
          isHost,
        },
      });
    });

    // If host starts a round while this client is waiting, navigate into the round
    socket.on("round-start", (roundData) => {
      const settings = activeGameInfoRef.current || {};
      // Prefer an explicit round number from the round payload, otherwise fall back to stored settings
      const roundNumber =
        roundData?.roundNumber ??
        roundData?.currentRound ??
        settings?.currentRound ??
        settings?.roundNumber ??
        1;
      navigate(`/room/${code}`, {
        state: {
          ...settings,
          ...roundData,
          currentRound: roundNumber,
          playerName,
          isHost: false,
        },
      });
    });

    // If host continues to next round, also navigate waiting players in
    socket.on("continue-to-next-round", ({ nextRound }) => {
      const settings = activeGameInfoRef.current || {};
      navigate(`/room/${code}`, {
        state: {
          ...settings,
          playerName,
          isHost: false,
          nextRound,
        },
      });
    });

    

    return () => {
      socket.off("join-error");
      socket.off("join-success");
      socket.off("players-updated");
      socket.off("join-active-game");
      socket.off("game-started");
      socket.off("round-start");
      socket.off("continue-to-next-round");
    };
  }, [code, playerName, navigate, isHost]);

  const handleStartGame = () => {
    // Basic validation: check if we have at least one player and socket connection
    if (socket && isHost && players.length > 0) {
      socket.emit("start-game", { code });
    }
  };

  const handleLeaveRoom = () => {
    // Notify server before leaving
    if (socket) {
      socket.emit("leave-room", { code, playerName });
    }
    navigate("/lobby", { state: { playerName } });
  };

  return (
    <div className="waiting-room-container">
      <div className="gradient">
        <h1 className="waiting-room-title">Waiting Room</h1>
        <div className="room-code-section">
          <h2>Room Code: {code}</h2>
          <CopyButton textToCopy={code || ""} />
        </div>
      </div>
      <div className="waiting-room-content">
        {activeGameInfo && (
          <div className="active-game-banner">
            <p>
              Game in progress. Please wait for the host to finish the round.
            </p>
            <p>Current Round: {activeGameInfo.currentRound ?? "?"}</p>
          </div>
        )}

        <div
          className={`players-list-section ${
            amountOfPlayersInRoom === 1 ? "single-player-mode" : ""
          }`}
        >
          <h2>
            {amountOfPlayersInRoom === 1
              ? "Single Player Mode"
              : `Players in Room - ${players.length} of ${amountOfPlayersInRoom}`}
          </h2>
          {amountOfPlayersInRoom === 1 ? (
            <div className="single-player">
              <div
                className={`player-item ${
                  players.length > 0 && players[0].name === playerName
                    ? "current-player"
                    : ""
                }`}
              >
                {players.length > 0 ? players[0].name : "Loading..."}{" "}
                {players.length > 0 && players[0].name === playerName && isHost
                  ? "(Host)"
                  : ""}
              </div>
            </div>
          ) : (
            <ul className="players-list">
              {players.map((player) => {
                const avatarId =
                  typeof player.avatar === "string"
                    ? player.avatar
                    : player.avatar?.id || "a1";
                const avatarSrc =
                  avatarId === "a2"
                    ? Avatar2
                    : avatarId === "a3"
                    ? Avatar3
                    : Avatar1;
                return (
                  <li
                    key={player.name}
                    className={`player-item ${
                      player.name === playerName ? "current-player" : ""
                    }`}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        marginRight: 8,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          typeof player.avatar === "object" &&
                          player.avatar?.color
                            ? player.avatar.color
                            : "transparent",
                      }}
                    >
                      <img
                        src={avatarSrc}
                        alt={`${player.name} avatar`}
                        style={{ width: 28, height: 28, borderRadius: "50%" }}
                      />
                    </div>
                    {player.name}{" "}
                    {player.name === playerName && isHost ? "(Host)" : ""}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div
          className={`buttons-section ${
            amountOfPlayersInRoom === 1 ? "single-player-mode" : ""
          }`}
        >
          <button onClick={handleLeaveRoom} className="leave-room-button">
            Leave Room
          </button>
          {isHost ? (
            <button onClick={handleStartGame} className="start-game-button">
              START GAME
            </button>
          ) : (
            <div className="waiting-section">
              <p>Waiting for host...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WaitingRoom;
