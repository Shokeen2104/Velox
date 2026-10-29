const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const peerStore = require('./db/peerStore');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

function setupSocketIO(server) {
  const allowedOrigins = process.env.FRONTEND_URL 
    ? [process.env.FRONTEND_URL, 'http://localhost:5173'] 
    : ['http://localhost:5173'];

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"]
    }
  });

  // Authentication middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error"));
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error("Authentication error"));
      socket.userId = decoded.userId;
      next();
    });
  });

  io.on('connection', (socket) => {
    console.log(`User ${socket.userId} connected on socket ${socket.id}`);

    // Track active socket connection in-memory
    peerStore.addSocket(socket.userId, socket.id);

    // --- WebRTC Signaling Relays ---

    // Relay Offer: Send to target user's active sockets (excluding self)
    socket.on('webrtc-offer', ({ targetUserId, offer, fileId }) => {
      const targetSockets = peerStore.getSocketsForUser(targetUserId);
      targetSockets.forEach((targetSocketId) => {
        if (targetSocketId !== socket.id) {
          io.to(targetSocketId).emit('webrtc-offer', {
            senderUserId: socket.userId,
            senderSocketId: socket.id,
            offer,
            fileId
          });
        }
      });
    });

    // Relay Answer directly to sender socket
    socket.on('webrtc-answer', ({ targetSocketId, answer, fileId }) => {
      io.to(targetSocketId).emit('webrtc-answer', {
        senderUserId: socket.userId,
        senderSocketId: socket.id,
        answer,
        fileId
      });
    });

    // Relay ICE Candidate
    socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
      let target = targetSocketId;
      // If targetSocketId is actually a userId, get an active socket
      const userSockets = peerStore.getSocketsForUser(targetSocketId);
      if (userSockets && userSockets.length > 0) {
        const otherSocket = userSockets.find(sid => sid !== socket.id);
        if (otherSocket) target = otherSocket;
      }
      
      io.to(target).emit('webrtc-ice-candidate', {
        senderUserId: socket.userId,
        senderSocketId: socket.id,
        candidate
      });
    });

    // Announce availability to seed/send a file
    socket.on('announce-seeding', ({ fileId }) => {
      console.log(`User ${socket.userId} is announcing seeding for file ${fileId}`);
      peerStore.addSeeder(fileId, socket.userId);
      io.emit('new-seeder', { fileId, userId: socket.userId });
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`User ${socket.userId} disconnected`);
      peerStore.removeSocket(socket.id);
    });
  });

  return io;
}

module.exports = setupSocketIO;
