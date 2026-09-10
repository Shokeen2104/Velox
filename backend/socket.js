const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const redisClient = require('./db/redis');

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

  io.on('connection', async (socket) => {
    console.log(`User ${socket.userId} connected on socket ${socket.id}`);

    // Track multiple sockets per user (multiple tabs)
    await redisClient.sAdd(`user:sockets:${socket.userId}`, socket.id);
    await redisClient.set(`socket:user:${socket.id}`, socket.userId.toString());

    // --- WebRTC Signaling Relays ---

    // Relay Offer — send to all of target user's sockets EXCEPT the sender
    socket.on('webrtc-offer', async ({ targetUserId, offer, fileId }) => {
      const targetSocketIds = await redisClient.sMembers(`user:sockets:${targetUserId}`);
      for (const targetSocketId of targetSocketIds) {
        if (targetSocketId !== socket.id) {
          io.to(targetSocketId).emit('webrtc-offer', {
            senderUserId: socket.userId,
            senderSocketId: socket.id,
            offer,
            fileId
          });
        }
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
      // Check if targetSocketId is actually a userId
      const socketIds = await redisClient.sMembers(`user:sockets:${targetSocketId}`);
      if (socketIds && socketIds.length > 0) {
        // It's a userId — pick a socket that isn't the sender
        const otherSocket = socketIds.find(sid => sid !== socket.id);
        if (otherSocket) target = otherSocket;
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
      io.emit('new-seeder', { fileId, userId: socket.userId });
    });

    // Disconnect handler
    socket.on('disconnect', async () => {
      console.log(`User ${socket.userId} disconnected`);
      // Remove only this socket from the user's set
      await redisClient.sRem(`user:sockets:${socket.userId}`, socket.id);
      await redisClient.del(`socket:user:${socket.id}`);
    });
  });

  return io;
}

module.exports = setupSocketIO;
