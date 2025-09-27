//entry point for the Express server
// This file sets up the server, handles routes, and integrates with the Deezer API client

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io"; 
import kpopRoutes from "./routes/kpopRoutes.js";

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

// handle connections
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // join room event
  socket.on("join", ({ code, playerName }) => {
    socket.join(code);
    console.log(`${playerName} joined room ${code}`);
    io.to(code).emit("player-joined", { playerName });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

app.listen(port, () =>
  console.log(`Server running at http://localhost:${port}`)
);
