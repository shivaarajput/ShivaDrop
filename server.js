// server.js - A simple WebRTC signaling server.
// It serves the client-side HTML and relays WebSocket messages between peers.

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// A simple map to hold WebSocket connections by room code.
// key: roomCode, value: { sender: WebSocket, receiver: WebSocket }
const rooms = new Map();

// Serve the index.html file from the public directory.
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

wss.on('connection', (ws, req) => {
  // Parse the room and role from the WebSocket connection URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomCode = url.searchParams.get('room');
  const role = url.searchParams.get('role');

  if (!roomCode || !role) {
    ws.close(1008, 'Room code and role are required.');
    console.error('Connection rejected: Missing room or role.');
    return;
  }

  // Get or create the room
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {});
  }
  const room = rooms.get(roomCode);

  // Assign the new client to their role in the room
  room[role] = ws;
  console.log(`Client connected: Room ${roomCode}, Role ${role}`);

  // Send a 'ready' signal to the sender once a receiver connects.
  if (room.sender && room.receiver) {
    console.log(`Room ${roomCode} is now full. Notifying sender.`);
    if (room.sender.readyState === WebSocket.OPEN) {
      room.sender.send(JSON.stringify({ type: 'ready' }));
    }
  }

  // Handle incoming signaling messages
  ws.on('message', (message) => {
    try {
      // The crucial change is here:
      // Parse the incoming message into a JSON object first.
      const data = JSON.parse(message);
      const otherRole = role === 'sender' ? 'receiver' : 'sender';
      const otherPeer = room[otherRole];

      // Now, re-stringifiy the data to send it. This ensures
      // that only valid JSON is relayed.
      if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
        otherPeer.send(JSON.stringify(data));
      }
    } catch (e) {
      console.error('Failed to parse or relay message:', e);
    }
  });

  // Handle disconnections
  ws.on('close', () => {
    console.log(`Client disconnected: Room ${roomCode}, Role ${role}`);
    // Clean up the room if this was the last peer
    delete room[role];
    if (Object.keys(room).length === 0) {
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} is now empty and has been removed.`);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
