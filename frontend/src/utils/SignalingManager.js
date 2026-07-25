import { io } from 'socket.io-client';

class SignalingManager {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token) {
    if (this.socket) return;
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    this.socket = io(API_URL, {
      auth: { token }
    });

    this.socket.on('connect', () => {
      console.log('Connected to signaling server with ID:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from signaling server');
    });

    // Relay WebRTC messages to registered listeners (usually SwarmManager)
    this.socket.on('webrtc-offer', (data) => this._emit('offer', data));
    this.socket.on('webrtc-answer', (data) => this._emit('answer', data));
    this.socket.on('webrtc-ice-candidate', (data) => this._emit('ice-candidate', data));
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Announce that we have a file registered and are ready to seed
  announceSeeding(fileId) {
    if (this.socket) {
      this.socket.emit('announce-seeding', { fileId });
    }
  }

  // --- WebRTC signaling methods ---
  
  sendOffer(targetUserId, offer, fileId) {
    this.socket.emit('webrtc-offer', { targetUserId, offer, fileId });
  }

  sendAnswer(targetSocketId, answer, fileId) {
    this.socket.emit('webrtc-answer', { targetSocketId, answer, fileId });
  }

  sendIceCandidate(targetSocketId, candidate) {
    this.socket.emit('webrtc-ice-candidate', { targetSocketId, candidate });
  }


  // --- Event Emitter logic for SwarmManager ---

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event).filter(cb => cb !== callback);
      this.listeners.set(event, callbacks);
    }
  }

  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  _emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => cb(data));
    }
  }
}

// Export a singleton instance
export const signalingManager = new SignalingManager();
