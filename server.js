const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

/* ---------------- MIDDLEWARE ---------------- */
app.use(express.json());

app.use(
  cors({
    origin: "*", // For production, replace "*" with your frontend URL
    methods: ["GET", "POST"],
  })
);

/* ---------------- CREATE HTTP SERVER ---------------- */
const server = http.createServer(app);

/* ---------------- SOCKET.IO SETUP ---------------- */
const io = new Server(server, {
  cors: {
    origin: "*", // Replace with frontend URL in production
    methods: ["GET", "POST"],
  },
});

/* ---------------- HEALTH CHECK ROUTE ---------------- */
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

/* ---------------- AGORA TOKEN API ---------------- */
app.get("/getToken", (req, res) => {
  try {
    const { channelName, uid } = req.query;

    if (!channelName) {
      return res.status(400).json({ error: "channelName is required" });
    }

    if (!process.env.APP_ID || !process.env.APP_CERTIFICATE) {
      return res
        .status(500)
        .json({ error: "Agora credentials not set in environment variables" });
    }

    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpireTimestamp =
      currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      process.env.APP_ID,
      process.env.APP_CERTIFICATE,
      channelName,
      uid || 0,
      role,
      privilegeExpireTimestamp
    );

    res.json({ token });
  } catch (error) {
    console.error("Token Error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

/* ---------------- SOCKET.IO LOGIC ---------------- */
let rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, userName }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: socket.id,
        users: [],
      };
    }

    rooms[roomId].users.push({
      id: socket.id,
      name: userName,
    });

    io.to(roomId).emit("participants", rooms[roomId].users);
    io.to(roomId).emit("host-info", rooms[roomId].host);
  });

  socket.on("chat-message", ({ roomId, message, userName }) => {
    io.to(roomId).emit("chat-message", { message, userName });
  });

  socket.on("kick-user", ({ roomId, userId }) => {
    if (rooms[roomId] && rooms[roomId].host === socket.id) {
      io.to(userId).emit("kicked");
    }
  });

  socket.on("end-meeting", ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].host === socket.id) {
      io.to(roomId).emit("meeting-ended");
      delete rooms[roomId];
    }
  });

  socket.on("disconnect", () => {
    for (let roomId in rooms) {
      rooms[roomId].users = rooms[roomId].users.filter(
        (user) => user.id !== socket.id
      );

      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit("participants", rooms[roomId].users);
      }
    }

    console.log("User disconnected:", socket.id);
  });
});

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 5713;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
