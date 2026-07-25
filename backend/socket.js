const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const redisClient = require('./db/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

function setupSocketIO(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
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

  io.on('connection', async (socket) => {
    console.log(`User ${socket.userId} connected on socket ${socket.id}`);

    // Mark user as online in Redis (map userId to socketId)
    // In a real app we might handle multiple tabs/sockets per user, but for now we map 1:1
    await redisClient.set(`user:socket:${socket.userId}`, socket.id);
    await redisClient.set(`socket:user:${socket.id}`, socket.userId.toString());

    // --- WebRTC Signaling Relays ---
    // The server doesn't understand the content of these messages, it just routes them
    // to the correct target socket ID.

    // Relay Offer
    socket.on('webrtc-offer', async ({ targetUserId, offer, fileId }) => {
      const targetSocketId = await redisClient.get(`user:socket:${targetUserId}`);
      if (targetSocketId) {
        io.to(targetSocketId).emit('webrtc-offer', {
          senderUserId: socket.userId,
          senderSocketId: socket.id,
          offer,
          fileId
        });
      }
    });

    // Relay Answer
    socket.on('webrtc-answer', ({ targetSocketId, answer, fileId }) => {
      io.to(targetSocketId).emit('webrtc-answer', {
        senderUserId: socket.userId,
        senderSocketId: socket.id,
        answer,
        fileId
      });
    });

    // Relay ICE Candidate
    socket.on('webrtc-ice-candidate', async ({ targetSocketId, candidate }) => {
      let target = targetSocketId;
      const mappedSocketId = await redisClient.get(`user:socket:${targetSocketId}`);
      if (mappedSocketId) {
        target = mappedSocketId;
      }
      
      io.to(target).emit('webrtc-ice-candidate', {
        senderUserId: socket.userId,
        senderSocketId: socket.id,
        candidate
      });
    });


    // Handle intent to seed
    socket.on('announce-seeding', async ({ fileId }) => {
      console.log(`User ${socket.userId} is announcing seeding for file ${fileId}`);
      await redisClient.sAdd(`file:seeders:${fileId}`, socket.userId.toString());
      // Broadcast to anyone who might be looking for seeders (optional)
      io.emit('new-seeder', { fileId, userId: socket.userId });
    });

    // Disconnect handler
    socket.on('disconnect', async () => {
      console.log(`User ${socket.userId} disconnected`);
      const userId = await redisClient.get(`socket:user:${socket.id}`);
      if (userId) {
        await redisClient.del(`user:socket:${userId}`);
        await redisClient.del(`socket:user:${socket.id}`);
        // Note: Removing from file:seeders sets is complex without knowing which files they seeded.
        // A robust system uses TTLs or scans on disconnect. We'll skip for this prototype, 
        // as the leecher will just fail to connect to offline peers and try the next one.
      }
    });
  });

  return io;
}

module.exports = setupSocketIO;
