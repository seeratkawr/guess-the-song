//entry point for the Express server
// This file sets up the server, handles routes, and integrates with the Deezer API client

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import trackRoutes from "./routes/trackRoutes.js";
import { createServer } from "http";
import { Server } from "socket.io";
import { console } from "inspector";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.disable("x-powered-by");

// K-Pop endpoints
app.use("/api/tracks", trackRoutes);

// tiny error handler
app.use((err, _req, res, _next) => {
  const status = err?.response?.status || 502;
  const msg =
    err?.response?.data?.error?.message || err?.message || "Upstream error";
  res.status(status).json({ error: msg });
});

const port = process.env.PORT || 8080;

// create HTTP server
const httpServer = createServer(app);

// attach Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "*", // allow React frontend
    methods: ["GET", "POST"],
  },
});

// Store room data
const rooms = new Map();

// Helper function to initialize player score data
const initializePlayerScore = (playerName, avatar = null) => ({
  name: playerName,
  avatar: avatar || null, // { id, color } or simple string id
  points: 0,
  previousPoints: 0,
  correctAnswers: 0,
});

//  handle connections
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("create-room", ({ code, settings, host, avatar }) => {
    socket.join(code);

    // Initialize room if it doesn't exist (with default settings)
    if (!rooms.has(code)) {
      console.log(`Creating new room ${code} with settings:`, settings);
      const room = {
        players: [],
        playerScores: new Map(), // Store player scores: playerName -> score object
        maxPlayers: settings.amountOfPlayers || 8, // default max players
        settings,
        host: host, // store host name
        hostSocketId: socket.id, // store host socket ID
        // New round state tracking
        currentRound: 1,
        isRoundActive: false,
        isIntermission: false,
        roundStartTime: null,
      };
      rooms.set(code, room);

      // For single player mode, automatically add the host to the room
      if (settings.amountOfPlayers === 1) {
        room.players.push(host);
        // host avatar may be provided as separate param
        const hostAvatar = avatar || null;
        room.playerScores.set(host, initializePlayerScore(host, hostAvatar));
        console.log(
          `Single player mode: ${host} automatically joined room ${code}`
        );
      }

      socket.emit("room-created", {
        code,
        rooms: Object.fromEntries(rooms.entries()),
      });
    }
  });

  // join room event
  socket.on("join", ({ code, playerName, avatar }) => {
    console.log(`${playerName} attempting to join room ${code}`);

    socket.join(code);

    const room = rooms.get(code);

    if (!room) {
      socket.emit("join-error", {
        message: `Room ${code} doesn't exist!`,
      });
      return;
    }

    // If this player is the host, update the host socket ID
    if (room.host === playerName) {
      room.hostSocketId = socket.id;
      console.log(`Host ${playerName} socket ID updated to ${socket.id}`);
    }

    // Check if room is full
    if (room.players.length >= room.maxPlayers) {
      console.log(
        `${playerName} tried to join full room ${code} (${room.players.length}/${room.maxPlayers})`
      );
      socket.emit("join-error", {
        message: `Room is full! (${room.players.length}/${room.maxPlayers} players)`,
      });
      return;
    }

    // Check for duplicate names
    if (room.players.includes(playerName)) {
      console.log(
        `${playerName} tried to join room ${code} but name already exists`
      );
      socket.emit("join-error", {
        message: `Player name "${playerName}" is already in this room!`,
      });
      return;
    }

    // Store player info for cleanup
    socket.playerName = playerName;
    socket.roomCode = code;

    // Add player to room
    room.players.push(playerName);

    // Initialize player score if not exists
    if (!room.playerScores) {
      room.playerScores = new Map();
    }
    if (!room.playerScores.has(playerName)) {
      room.playerScores.set(
        playerName,
        initializePlayerScore(playerName, avatar || null)
      );
    }

    console.log(
      `${playerName} joined room ${code}. Players (${room.players.length}/${room.maxPlayers}):`,
      room.players
    );

    // Also send updated scores if available
    if (room.playerScores && room.playerScores.size > 0) {
      const allScores = Array.from(room.playerScores.values());
      io.to(code).emit("score-update", allScores);
    }

    // Send success confirmation to the joining player
    io.to(code).emit("join-success", {
      roomCode: code,
      playerName,
      players: room.players,
      maxPlayers: room.maxPlayers,
      amountOfPlayersInRoom: room.settings.amountOfPlayers, // default to 8 if not set,
      playerScores: Array.from(room.playerScores.values()),
    });

    // Send current scores to the new player
    if (room.playerScores && room.playerScores.size > 0) {
      const allScores = Array.from(room.playerScores.values());
      socket.emit("score-update", allScores);
    }

    // Check if game is already active
    if (room.gameActive) {
      // Game is in progress - send them directly to the game
      socket.emit("join-active-game", {
        ...room.settings,
        playerName,
        isHost: false,
        currentRound: room.currentRound || 1,
        isRoundActive: !!room.isRoundActive,
        isIntermission: !!room.isIntermission,
        roundStartTime: room.roundStartTime,
        players: room.players,
        playerScores: Array.from(room.playerScores.values()),
      });
      return;
    } else {
      // Game hasn't started - normal waiting room flow
      socket.emit("join-success", {
        players: room.players,
        amountOfPlayersInRoom: room.maxPlayers,
      });
    }
  });

  socket.on("get-room-players-scores", (code) => {
    socket.join(code);

    const room = rooms.get(code);

    if (!room) {
      console.log(`Room ${code} doesn't exist when getting player scores`);
      socket.emit("room-players-scores", []);
      return;
    }

    io.to(code).emit(
      "room-players-scores",
      Array.from(room.playerScores.values()) || []
    );
  });

  socket.on("get-total-rounds", (code) => {
    socket.join(code);

    const room = rooms.get(code);

    if (!room) {
      console.log(`Room ${code} doesn't exist when getting total rounds`);
      socket.emit("total-rounds", 5); // default fallback
      return;
    }

    socket.emit("total-rounds", room.settings.rounds);
  });

  socket.on("get-rooms", (code) => {
    socket.join(code);

    io.to(code).emit("rooms", Object.fromEntries(rooms.entries()));
  });

  // Handle score updates from players
  socket.on("update-score", ({ code, playerName, points, correctAnswers }) => {
    console.log(`🔍 DEBUG Backend received update-score:`, {
      code,
      playerName,
      points,
      correctAnswers,
      pointsType: typeof points,
      correctAnswersType: typeof correctAnswers,
    });

    const room = rooms.get(code);
    if (!room || !room.playerScores) {
      console.log(
        `❌ DEBUG: Room not found or no playerScores for code: ${code}`
      );
      return;
    }

    const playerScore = room.playerScores.get(playerName);
    if (playerScore) {
      playerScore.points = points;
      playerScore.correctAnswers = correctAnswers;

      console.log(`🔍 DEBUG: After update - playerScore:`, playerScore);
      console.log(
        `Score updated for ${playerName}: ${points} points, ${correctAnswers} correct`
      );

      // Send updated scores to all players in the room
      const allScores = Array.from(room.playerScores.values());
      io.to(code).emit("score-update", allScores);
    }
  });

  // Handle host continuing to next round
  socket.on("host-continue-round", ({ code, nextRound, totalRounds }) => {
    console.log(`Host in room ${code} continuing to round ${nextRound}`);
    const room = rooms.get(code);
    if (room) {
      // update authoritative round state on server
      room.currentRound = nextRound;
      room.isRoundActive = true;
      room.isIntermission = false;
      room.roundStartTime = Date.now();
    }

    // Emit to all players in the room (including host)
    socket.to(code).emit("continue-to-next-round", { nextRound });
    socket.emit("continue-to-next-round", { nextRound }); // Also send to host
  });

  // Handle host ending the game
  socket.on("host-end-game", ({ code }) => {
    console.log(`Host in room ${code} ending the game`);

    // Navigate all players to end game page
    socket.to(code).emit("navigate-to-end-game");
    socket.emit("navigate-to-end-game"); // Also send to host
  });

  // host starts game event
  socket.on("start-game", ({ code }) => {
    const room = rooms.get(code);
    if (room) {
      room.gameActive = true;
      // When game starts we consider the first round not yet active until host starts a round
      room.currentRound = 1;
      room.isRoundActive = false;
      room.isIntermission = true; // waiting for host to start round
      room.roundStartTime = null;

      const settings = room.settings;
      io.to(code).emit("game-started", settings);
      console.log(`Game started in room ${code}`);
    }
  });

  // host distributes round data to all players
  socket.on(
    "host-start-round",
    ({ code, song, choices, answer, startTime, songIndex, multiSongs }) => {
      const room = rooms.get(code);
      if (!room) {
        console.log(`Host tried to start round in room ${code}`);
        return;
      }

      // Reset previousPoints for all players at the start of the round
      room.playerScores.forEach((playerScore) => {
        playerScore.previousPoints = playerScore.points;
      });

      // Mark the round active and store start time & ensure currentRound exists
      room.isRoundActive = true;
      room.isIntermission = false;
      room.roundStartTime = startTime || Date.now();
      room.gameActive = true;
      // Ensure currentRound defaults to 1 if undefined
      room.currentRound = room.currentRound || 1;

      // --- Persist the current round payload so late joiners can request it ---
      room.currentRoundData = { song, choices, answer };

      console.log(
        `Host starting round in room ${code} with song:`,
        song?.title
      );

      // Send round data to all players in the room
      io.to(code).emit("round-start", {
        song,
        choices,
        answer,
        startTime: startTime || Date.now(),
        songIndex,
        multiSongs,
      });
    }
  );

  // reply with current round data for clients that missed the live event
  socket.on("get-current-round", (code) => {
    const room = rooms.get(code);
    if (!room) {
      socket.emit("current-round", null);
      return;
    }
    if (room.isRoundActive && room.currentRoundData) {
      socket.emit("current-round", {
        ...room.currentRoundData,
        startTime: room.roundStartTime,
        currentRound: room.currentRound,
      });
    } else {
      socket.emit("current-round", null);
    }
  });

  socket.on("host-skip-round", ({ code }) => {
    const room = rooms.get(code);
    if (
      room &&
      (room.hostSocketId === socket.id || room.host === socket.playerName)
    ) {
      // Host skipped - notify all players in the room to show leaderboard
      io.to(code).emit("host-skipped-round");
      console.log(`Host skipped round in room ${code}`);
    } else {
      console.log(
        `Non-host tried to skip in room ${code}. Socket ID: ${socket.id}, Host Socket ID: ${room?.hostSocketId}`
      );
    }
  });

  socket.on("leave-room", ({ code, playerName }) => {
    console.log(`${playerName} manually leaving room ${code}`);

    const room = rooms.get(code);
    if (room) {
      const playerIndex = room.players.indexOf(playerName);
      if (playerIndex > -1) {
        // Remove player
        room.players.splice(playerIndex, 1);
        room.playerScores.delete(playerName);

        // Handle host transfer
        if (room.host === playerName && room.players.length > 0) {
          room.host = room.players[0];
          const hostSocket = [...io.sockets.sockets.values()].find(
            (s) => s.playerName === room.host
          );
          if (hostSocket) {
            room.hostSocketId = hostSocket.id;
          }
        }

        // Update remaining players
        const updatedScores = Array.from(room.playerScores.values());
        io.to(code).emit("players-updated", {
          players: room.players,
          maxPlayers: room.maxPlayers,
          playerScores: updatedScores,
          newHost: room.host,
        });

        // Clean up empty rooms
        if (room.players.length === 0) {
          rooms.delete(code);
        }
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);

    // Clean up player from room if they were in one
    if (socket.playerName && socket.roomCode && rooms.has(socket.roomCode)) {
      const room = rooms.get(socket.roomCode);
      const playerIndex = room.players.indexOf(socket.playerName);
      if (playerIndex > -1) {
        // Remove from players array
        room.players.splice(playerIndex, 1);

        // Remove from player scores
        room.playerScores.delete(socket.playerName);

        console.log(
          `${socket.playerName} left room ${socket.roomCode}. Remaining players:`,
          room.players
        );

        // Handle host leaving
        if (room.host === socket.playerName && room.players.length > 0) {
          // Transfer host to first remaining player
          room.host = room.players[0];
          console.log(
            `Host transferred to ${room.host} in room ${socket.roomCode}`
          );

          // Update host socket ID
          const hostSocket = [...io.sockets.sockets.values()].find(
            (s) => s.playerName === room.host
          );
          if (hostSocket) {
            room.hostSocketId = hostSocket.id;
          }
        }

        // Update remaining players with new player list and scores
        const updatedScores = Array.from(room.playerScores.values());
        io.to(socket.roomCode).emit("players-updated", {
          players: room.players,
          maxPlayers: room.maxPlayers,
          playerScores: updatedScores,
          newHost: room.host,
        });

        // Clean up empty rooms
        if (room.players.length === 0) {
          rooms.delete(socket.roomCode);
          console.log(`Room ${socket.roomCode} deleted - no players left`);
        }
      }
    }
  });
});

httpServer.listen(port, "0.0.0.0", () => {});
