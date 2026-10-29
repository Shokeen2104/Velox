/**
 * In-Memory Peer Store
 * 
 * Replaces Redis for single-node deployments.
 * Tracks active socket connections and active file seeders in-memory.
 */

// userId -> Set<socketId>
const userSockets = new Map();

// socketId -> userId
const socketUsers = new Map();

// fileId -> Set<userId>
const fileSeeders = new Map();

const peerStore = {
  // Add a socket for a user
  addSocket(userId, socketId) {
    const uId = userId.toString();
    if (!userSockets.has(uId)) {
      userSockets.set(uId, new Set());
    }
    userSockets.get(uId).add(socketId);
    socketUsers.set(socketId, uId);
  },

  // Remove a socket when disconnected
  removeSocket(socketId) {
    const userId = socketUsers.get(socketId);
    if (!userId) return null;

    socketUsers.delete(socketId);
    const sockets = userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        userSockets.delete(userId);
      }
    }
    return userId;
  },

  // Get all active socket IDs for a user
  getSocketsForUser(userId) {
    const uId = userId.toString();
    const sockets = userSockets.get(uId);
    return sockets ? Array.from(sockets) : [];
  },

  // Check if a user is currently online (has >= 1 active socket)
  isUserOnline(userId) {
    const uId = userId.toString();
    const sockets = userSockets.get(uId);
    return !!(sockets && sockets.size > 0);
  },

  // Register a user as a seeder/sender for a file
  addSeeder(fileId, userId) {
    const fId = fileId.toString();
    const uId = userId.toString();
    if (!fileSeeders.has(fId)) {
      fileSeeders.set(fId, new Set());
    }
    fileSeeders.get(fId).add(uId);
  },

  // Remove a user as a seeder
  removeSeeder(fileId, userId) {
    const fId = fileId.toString();
    const uId = userId.toString();
    const seeders = fileSeeders.get(fId);
    if (seeders) {
      seeders.delete(uId);
      if (seeders.size === 0) {
        fileSeeders.delete(fId);
      }
    }
  },

  // Get all registered seeders for a file
  getAllSeeders(fileId) {
    const fId = fileId.toString();
    const seeders = fileSeeders.get(fId);
    return seeders ? Array.from(seeders) : [];
  },

  // Get only seeders who currently have an active socket connection
  getOnlineSeeders(fileId) {
    const all = this.getAllSeeders(fileId);
    return all.filter(userId => this.isUserOnline(userId));
  },

  // Clean up file entry on file deletion
  deleteFile(fileId) {
    fileSeeders.delete(fileId.toString());
  }
};

module.exports = peerStore;

