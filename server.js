const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { RtcTokenBuilder, RtcRole } = require("agora-access-token");

const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// ---------------- TOKEN API ----------------
app.get("/getToken", (req, res) => {
  const channelName = req.query.channelName;
  const uid = req.query.uid || 0;

  if (!channelName) {
    return res.status(400).json({ error: "channelName is required" });
  }

  const role = RtcRole.PUBLISHER;
  const expirationTimeInSeconds = 3600;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpireTimestamp = currentTimestamp + expirationTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    process.env.APP_ID,
    process.env.APP_CERTIFICATE,
    channelName,
    uid,
    role,
    privilegeExpireTimestamp
  );

  res.json({ token });
});

// ---------------- SOCKET.IO LOGIC ----------------
let rooms = {}; // store room participants + host

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, userName }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = { host: socket.id, users: [] };
    }

    rooms[roomId].users.push({ id: socket.id, name: userName });

    io.to(roomId).emit("participants", rooms[roomId].users);

    io.to(roomId).emit("host-info", rooms[roomId].host);
  });

  // Chat message
  socket.on("chat-message", ({ roomId, message, userName }) => {
    io.to(roomId).emit("chat-message", { message, userName });
  });

  // Host kicks a user
  socket.on("kick-user", ({ roomId, userId }) => {
    if (rooms[roomId] && rooms[roomId].host === socket.id) {
      io.to(userId).emit("kicked");
    }
  });

  // Host ends meeting for all
  socket.on("end-meeting", ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].host === socket.id) {
      io.to(roomId).emit("meeting-ended");
      delete rooms[roomId];
    }
  });

  socket.on("disconnect", () => {
    for (let roomId in rooms) {
      rooms[roomId].users = rooms[roomId].users.filter(
        (u) => u.id !== socket.id
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

server.listen(process.env.PORT, () => {
  console.log("Server running on port", process.env.PORT);
});
