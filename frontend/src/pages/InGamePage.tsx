import React, { useState, useEffect, useRef } from "react";
import "../css/InGamePage.css";
import Scoreboard from "../components/Scoreboard";
import GameHeader from "../components/GameHeader";
import MultipleChoice from "../components/MultipleChoice";
import SingleChoice from "../components/SingleChoice";
import AudioControls from "../components/AudioControls";
import RoundScoreDisplay from "../components/RoundScoreDisplay";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { songService } from "../services/songServices";
import type { Song } from "../types/song";
import { io, Socket } from "socket.io-client";

//interface GuessifyProps {}
interface Player {
  name: string;
  points: number;
  previousPoints: number;
  correctAnswers: number;
}

const InGamePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { code } = useParams<{ code: string }>(); // room code from URL

  // --- Extract settings safely ---
  const state = location.state as {
    playerName?: string;
    rounds?: string;
    guessTime?: string;
    gameMode?: string;
    isHost?: boolean;
  };

  const playerName = state?.playerName || "You";
  const isHost = state?.isHost || false;
  
    // --- Socket setup ---
  const [socket, setSocket] = useState<Socket | null>(null);

  // --- Player State ---
  const [players, setPlayers] = useState<Player[]>([]);
  const [player, setPlayer] = useState<Player>({
    name: playerName,
    points: 0,
    previousPoints: 0,
    correctAnswers: 0,
  });

  // --- Game Settings ---
  const totalRounds = parseInt(state?.rounds || "10");
  const roundTime = parseInt(state?.guessTime || "30");
  const isSingleSong = state?.gameMode === "Single Song";

  // --- Round State ---
  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(parseInt(state?.guessTime || "30"));
  const [roundStartTime, setRoundStartTime] = useState<number | null>(null);
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [isIntermission, setIsIntermission] = useState(false);
  const [inviteCode] = useState(code || "INVALID");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // --- Single Song Mode ---
  const [hasGuessedCorrectly, setHasGuessedCorrectly] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);

  // --- Multiple Choice Mode ---
  const [hasSelectedCorrectly, setHasSelectedCorrectly] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [correctAnswer, setCorrectAnswer] = useState<string>("");
  const [isTimeUp, setIsTimeUp] = useState(false);

  // --- Round Control Helpers ---
  const isRoundStarting = useRef(false);
  const roundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ----------------- SOCKET CONNECTION ----------------- */
  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:8080";
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    // Join the room
    newSocket.emit("join", { code, playerName });

    // Initialize players list with current player
    setPlayers([{
      name: playerName,
      points: 0,
      previousPoints: 0,
      correctAnswers: 0,
    }]);

    // Update when players join
    newSocket.on("player-joined", ({ playerName: newPlayerName }) => {
      setPlayers((prev) => {
        // Check if player already exists
        if (prev.some(p => p.name === newPlayerName)) {
          return prev;
        }
        return [
          ...prev,
          { name: newPlayerName, points: 0, previousPoints: 0, correctAnswers: 0 },
        ];
      });
    });

    // Host starts round → everyone gets the same song
    newSocket.on("round-start", ({ song, choices, answer, startTime }) => {
      setCurrentSong(song);
      setOptions(choices);
      setCorrectAnswer(answer);
      const roundStart = startTime || Date.now();
      setRoundStartTime(roundStart);
      setIsRoundActive(true);
      setTimeLeft(parseInt(state?.guessTime || "30"));
    });

    // Score update
    newSocket.on("score-update", (updatedPlayers: Player[]) => {
      setPlayers(updatedPlayers);
      // Update current player state from the players list
      const currentPlayer = updatedPlayers.find(p => p.name === playerName);
      if (currentPlayer) {
        setPlayer(currentPlayer);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [code, playerName, state?.guessTime]);

 /* ----------------- ROUND LOGIC ----------------- */
  useEffect(() => {
    if (isRoundActive && timeLeft > 0) {
      roundTimer.current = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    }
    if (timeLeft === 0) {
      setIsRoundActive(false);
      socket?.emit("round-end", { code });
    }
    return () => {
      if (roundTimer.current) clearTimeout(roundTimer.current);
    };
  }, [isRoundActive, timeLeft, socket, code]);

  /* ----------------- HELPER FUNCTIONS ----------------- */

  // Get a random set of songs for multiple choice rounds
  const getRandomSongs = (num: number): Song[] => {
    const all = songService.getCachedSongs();
    const shuffled = [...all].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, num);
  };

  // Generate multiple choice options including correct answer + distractors
  const generateOptions = (correctSongs: Song[]): string[] => {
    const all = songService.getCachedSongs();
    const correctTitles = correctSongs.map((s) => s.title);

    // Generate a random incorrect option as a "mix"
    function randomMix(): string {
      const shuffled = [...all].sort(() => 0.5 - Math.random());
      return shuffled
        .slice(0, 3)
        .map((s) => s.title)
        .join(", ");
    }

    const opts: string[] = [];
    opts.push(correctTitles.join(", "));

    while (opts.length < 4) {
      const mix = randomMix();
      if (!opts.includes(mix)) opts.push(mix);
    }

    return opts.sort(() => 0.5 - Math.random());
  };
  

  // Calculate points based on how quickly the answer was given (min 100, max 1000)
  const calculatePoints = (): number => {
    if (!roundStartTime) return 500; // fallback if no start time
    
    const maxPoints = 1000;
    const minPoints = 100;
    const elapsedTime = (Date.now() - roundStartTime) / 1000; // seconds
    const timeRatio = Math.max(0, (roundTime - elapsedTime) / roundTime);
    const points = Math.floor(minPoints + (maxPoints - minPoints) * timeRatio);
    return Math.max(points, minPoints);
  };

  // Add points and optionally increment correctAnswers
  const addPointsToPlayer = (points: number, correct: boolean = false) => {
    // Update the current player's state
    setPlayer(prev => ({
      ...prev,
      points: prev.points + points,
      correctAnswers: correct ? prev.correctAnswers + 1 : prev.correctAnswers,
    }));

    // Update the players list
    setPlayers(prev => prev.map(p => 
      p.name === playerName 
        ? {
            ...p,
            points: p.points + points,
            correctAnswers: correct ? p.correctAnswers + 1 : p.correctAnswers,
          }
        : p
    ));

    // Emit score update to server
    if (socket) {
      socket.emit("score-update", {
        code,
        playerName,
        points: points,
        correct: correct
      });
    }
  };

  /* ----------------- HANDLERS ----------------- */

  // Handle multiple choice selection
  const handleSelect = (index: number) => {
    if (selectedIndex !== null) return;

    setSelectedIndex(index);
    const chosen = options[index];

    if (chosen === correctAnswer) {
      const points = calculatePoints();
      addPointsToPlayer(points, true); // Correct answer count
      setHasSelectedCorrectly(true);
      setShowCorrectAnswer(true);
      // Stop the song and go immediately to round score display
      songService.stopSong();
      setIsRoundActive(false);
      setIsIntermission(true);
    } else {
      setHasSelectedCorrectly(false);
      setShowCorrectAnswer(true);
      // For MCQ, wrong answer ends the round immediately (not time up)
      setIsTimeUp(false);
      songService.stopSong();
      setIsRoundActive(false);
      setIsIntermission(true);
    }
  };

  // Handle correct guess in single song mode
  const handleCorrectGuess = () => {
    if (!hasGuessedCorrectly) {
      const points = calculatePoints();
      addPointsToPlayer(points, true); // correct answer count
      setHasGuessedCorrectly(true);
      // Stop the song and go immediately to round score display
      songService.stopSong();
      setIsRoundActive(false);
      setIsIntermission(true);
    }
  };

  // End round when time runs out
  function handleRoundEnd() {
    songService.stopSong();

    // Time ran out - will show correct answer in round score display
    setIsTimeUp(true);
    setIsRoundActive(false);
    setIsIntermission(true);
  }

  // Continue to next round or navigate to end game screen
  const handleContinueToNextRound = () => {
    if (currentRound < totalRounds) {
      setCurrentRound(r => r + 1);
      setTimeLeft(roundTime);
      setIsRoundActive(true);
      setIsIntermission(false);
      setSelectedIndex(null);
    } else {
      // Navigate to end game page
      navigate("/end_game", {
        state: {
          players: players.map(p => ({
            name: p.name,
            points: p.points,
            correctAnswers: p.correctAnswers,
            totalRounds: totalRounds, 
          })),
        },
      });
    }
  };


  /* ----------------- EFFECTS ----------------- */ 

  // Subscribe to song changes
  useEffect(() => {
    songService.setOnTrackChange((song) => {
      setCurrentSong(song);
    });

    return () => {
      songService.stopSong();
      isRoundStarting.current = false;
    };
  }, []);

  // Start a new round whenever `currentRound` changes
  useEffect(() => {
    if (isRoundStarting.current) return;

    isRoundStarting.current = true;
    songService.stopSong();

    // Update previous points before starting new round (except for first round)
    if (currentRound > 1) {
      setPlayer(prev => ({
        ...prev,
        previousPoints: prev.points,
      }));
      
      setPlayers(prev => prev.map(p => ({
        ...p,
        previousPoints: p.points,
      })));
    }

    // Reset round state
    setIsRoundActive(true);
    setTimeLeft(roundTime);
    setRoundStartTime(Date.now());
    setHasGuessedCorrectly(false);
    setHasSelectedCorrectly(false);
    setShowCorrectAnswer(false);
    setIsTimeUp(false);

    // Start playback depending on game mode
    if (isSingleSong) {
      if (currentRound === 1) songService.playSong();
      else songService.playNextSong();
    } else {
      const chosen = getRandomSongs(3);
      songService.playMultiSong(chosen);

      const opts = generateOptions(chosen);
      setOptions(opts);
      setCorrectAnswer(chosen.map(s => s.title).join(", "));
    }
    // Release "starting lock" after 1s
    setTimeout(() => { isRoundStarting.current = false; }, 1000);
  }, [currentRound, isSingleSong, roundTime]);

  // Countdown timer logic
  useEffect(() => {
    if (!isRoundActive || isIntermission) return;

    if (timeLeft <= 0) {
      handleRoundEnd();
      return;
    }

    const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, isRoundActive, isIntermission]);


  /* ----------------- RENDER ----------------- */

  return (
    <div className="game-2-container">
      <AudioControls />
      {isIntermission ? (
        <RoundScoreDisplay
          players={players}
          roundNumber={currentRound}
          totalRounds={totalRounds}
          onContinue={handleContinueToNextRound}
          isFinalRound={currentRound === totalRounds}
          correctAnswer={isSingleSong ? currentSong?.title : correctAnswer}
          playerGotCorrect={isSingleSong ? hasGuessedCorrectly : hasSelectedCorrectly}
          isTimeUp={isTimeUp}
        />
      ) : (
        <>
          <GameHeader
            roundNumber={`${currentRound}/${totalRounds}`}
            timer={`${timeLeft}`}
            inviteCode={inviteCode}
          />
          <div className="game-2-body">
            <Scoreboard players={players} />
            {isSingleSong ? (
              <SingleChoice
                onCorrectGuess={handleCorrectGuess}
                currentSong={currentSong}
                hasGuessedCorrectly={hasGuessedCorrectly}
                onWrongGuess={() => {
                  // Optional: Add any logic for wrong guesses
                }}
              />
            ) : (
              <MultipleChoice
                options={options}
                onSelect={handleSelect}
                selectedIndex={selectedIndex}
                correctAnswer={correctAnswer}
                showCorrectAnswer={showCorrectAnswer}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default InGamePage;