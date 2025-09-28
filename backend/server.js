//entry point for the Express server
// This file sets up the server, handles routes, and integrates with the Deezer API client

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io"; 
import kpopRoutes from "./routes/kpopRoutes.js";
import { console } from "inspector";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// K-Pop endpoints
app.use("/api/kpop", kpopRoutes);

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

//  handle connections
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("create-room", ({ code, settings, host }) => {

    // Initialize room if it doesn't exist (with default settings)
    if (!rooms.has(code)) {
      console.log(`Creating new room ${code} with default settings`);
      rooms.set(code, { 
        players: [], 
        maxPlayers: settings.amountOfPlayers || 8, // default max players
        settings,
        host
      });

      socket.emit("room-created");
    }
  });

  // join room event
  socket.on("join", ({ code, playerName }) => {
    console.log(`${playerName} attempting to join room ${code}`);

    const room = rooms.get(code);

    if(!room) {
      socket.emit("join-error", { 
        message: `Room ${code} doesn't exist!` 
      });
      return;
    }
    
    // Check if room is full
    if (room.players.length >= room.maxPlayers) {
      console.log(`${playerName} tried to join full room ${code} (${room.players.length}/${room.maxPlayers})`);
      socket.emit("join-error", { 
        message: `Room is full! (${room.players.length}/${room.maxPlayers} players)` 
      });
      return;
    }
    
    // Check for duplicate names
    if (room.players.includes(playerName)) {
      console.log(`${playerName} tried to join room ${code} but name already exists`);
      socket.emit("join-error", { 
        message: `Player name "${playerName}" is already in this room!` 
      });
      return;
    }
    
    // Join the room
    socket.join(code);
    
    // Store player info for cleanup
    socket.playerName = playerName;
    socket.roomCode = code;
    
    // Add player to room
    room.players.push(playerName);
    
    console.log(`${playerName} joined room ${code}. Players (${room.players.length}/${room.maxPlayers}):`, room.players);
    
    // Send updated player list to everyone in the room
    io.to(code).emit("players-updated", { 
      players: room.players, 
      maxPlayers: room.maxPlayers 
    });
    
    // Send success confirmation to the joining player
    socket.emit("join-success", { 
      roomCode: code, 
      playerName,
      players: room.players,
      maxPlayers: room.maxPlayers,
      amountOfPlayersInRoom: room.settings.amountOfPlayers // default to 8 if not set,
    });
  });

  // host starts game event
  socket.on("start-game", ({ code, settings }) => {
    console.log(`Game started in room ${code} with settings:`, settings);
    io.to(code).emit("game-started", settings);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    
    // Clean up player from room if they were in one
    if (socket.playerName && socket.roomCode && rooms.has(socket.roomCode)) {
      const room = rooms.get(socket.roomCode);
      const playerIndex = room.players.indexOf(socket.playerName);
      if (playerIndex > -1) {
        room.players.splice(playerIndex, 1);
        console.log(`${socket.playerName} left room ${socket.roomCode}. Remaining players:`, room.players);
        
        // Update remaining players
        io.to(socket.roomCode).emit("players-updated", { 
          players: room.players, 
          maxPlayers: room.maxPlayers 
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

httpServer.listen(port, "0.0.0.0", () => {
});
