import { signalingManager } from './SignalingManager';

/**
 * SwarmManager (1-to-1 WebRTC Peer Transfer Manager)
 * 
 * Manages direct browser-to-browser WebRTC DataChannel connections,
 * sequential chunk streaming, and on-the-fly SHA-256 integrity verification.
 * Includes connection heartbeat, stall detection, and clear failure reporting.
 */
export class SwarmManager {
  constructor() {
    this.peers = new Map();           // peerId -> RTCPeerConnection
    this.dataChannels = new Map();    // peerId -> RTCDataChannel
    this.seededFiles = new Map();     // fileId -> File / Blob (held locally by sender)
    this.activeDownloads = new Map(); // fileId -> downloadState
    this.chunkTimeouts = new Map();   // fileId -> setTimeout id for stall detection
    this.listeners = [];

    // Clear any stale listeners from previous HMR instances
    signalingManager.removeAllListeners('offer');
    signalingManager.removeAllListeners('answer');
    signalingManager.removeAllListeners('ice-candidate');

    signalingManager.on('offer', this.handleOffer.bind(this));
    signalingManager.on('answer', this.handleAnswer.bind(this));
    signalingManager.on('ice-candidate', this.handleIceCandidate.bind(this));

    this.lastIncomingHeader = null;
  }

  addListener(callback) {
    this.listeners.push(callback);
    callback({
      peers: Array.from(this.peers.keys()),
      downloads: Array.from(this.activeDownloads.values())
    });
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(cb => cb !== callback);
  }

  notifyUI() {
    const state = {
      peers: Array.from(this.peers.keys()),
      downloads: Array.from(this.activeDownloads.values())
    };
    this.listeners.forEach(cb => cb(state));
  }

  // Sender registers a file in local memory ready to stream to requesting peers
  startSeeding(fileId, fileBlob) {
    this.seededFiles.set(fileId.toString(), fileBlob);
    signalingManager.announceSeeding(fileId);
    console.log(`[P2P] Ready to send file ${fileId}`);
    this.notifyUI();
  }

  // Reset or cancel a failed download so user can retry
  resetDownload(fileId) {
    const fileIdStr = fileId.toString();
    this.clearChunkTimeout(fileIdStr);
    this.activeDownloads.delete(fileIdStr);

    // Close any open DataChannel and PeerConnection for this transfer
    for (const [peerId, dc] of this.dataChannels.entries()) {
      try { dc.close(); } catch {}
      this.dataChannels.delete(peerId);
    }
    for (const [peerId, pc] of this.peers.entries()) {
      try { pc.close(); } catch {}
      this.peers.delete(peerId);
    }

    this.notifyUI();
  }

  // Receiver initiates a 1-to-1 P2P download
  async startDownload(file, chunksManifest, seeders) {
    const fileIdStr = file.id.toString();

    // If already downloading or completed, don't restart unless reset
    const existing = this.activeDownloads.get(fileIdStr);
    if (existing && existing.status !== 'complete' && !existing.status.startsWith('failed')) {
      console.log(`[P2P] Download already active for ${fileIdStr}, skipping.`);
      return;
    }

    // Fast-path: If the sender is the same client (same browser session)
    const seededFile = this.seededFiles.get(fileIdStr);
    if (seededFile) {
      this.activeDownloads.set(fileIdStr, {
        file,
        manifest: chunksManifest,
        receivedChunks: new Map(),
        status: 'complete',
        progress: 100
      });
      this.notifyUI();

      const url = URL.createObjectURL(seededFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    // Set up active download state
    this.activeDownloads.set(fileIdStr, {
      file,
      manifest: chunksManifest,
      receivedChunks: new Map(),
      status: 'connecting',
      progress: 0,
      bytesReceived: 0,
      speed: 0,
      startTime: Date.now()
    });
    this.notifyUI();

    // 1-to-1 transfer: check if sender is available
    if (!seeders || seeders.length === 0) {
      console.error('[P2P] No sender currently online for file', file.id);
      this.markFailed(fileIdStr, 'Uploader is offline');
      return;
    }

    const targetSenderId = seeders[0];
    console.log(`[P2P] Connecting to sender: ${targetSenderId}`);
    this.connectToPeer(targetSenderId, file.id);

    // Timeout safety: 10 seconds to establish P2P connection
    setTimeout(() => {
      const dl = this.activeDownloads.get(fileIdStr);
      if (dl && dl.status === 'connecting') {
        console.error(`[P2P] Connection timeout for file ${fileIdStr}`);
        this.markFailed(fileIdStr, 'Sender unreachable (timeout)');
      }
    }, 10000);
  }

  markFailed(fileId, reason) {
    const fileIdStr = fileId.toString();
    this.clearChunkTimeout(fileIdStr);
    const dl = this.activeDownloads.get(fileIdStr);
    if (dl && dl.status !== 'complete') {
      dl.status = `failed (${reason})`;
      dl.speed = 0;
      this.notifyUI();
    }
  }

  // Create WebRTC Offer and send via Socket.IO signaling
  async connectToPeer(targetUserId, fileId) {
    const pc = this.createPeerConnection(targetUserId, fileId);
    const dc = pc.createDataChannel(`transfer-${fileId}`);
    this.setupDataChannel(dc, targetUserId, fileId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    signalingManager.sendOffer(targetUserId, offer, fileId);
    this.notifyUI();
  }

  // Handle incoming Offer from receiver (Sender side)
  async handleOffer({ _senderUserId, senderSocketId, offer, fileId }) {
    console.log(`[P2P] Received offer from ${senderSocketId}`);
    const pc = this.createPeerConnection(senderSocketId, fileId);

    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, senderSocketId, fileId);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    if (pc.pendingCandidates) {
      for (const candidate of pc.pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(e));
      }
      pc.pendingCandidates = [];
    }
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    signalingManager.sendAnswer(senderSocketId, answer, fileId);
    this.notifyUI();
  }

  // Handle incoming Answer from sender (Receiver side)
  async handleAnswer({ senderSocketId, answer }) {
    let pc = this.peers.get(senderSocketId);
    if (!pc) {
      const firstKey = Array.from(this.peers.keys())[0];
      pc = this.peers.get(firstKey);
      if (pc) {
        this.peers.delete(firstKey);
        this.peers.set(senderSocketId, pc);
      }
    }

    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      
      if (pc.pendingCandidates) {
        for (const candidate of pc.pendingCandidates) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(e));
        }
        pc.pendingCandidates = [];
      }
    }
    this.notifyUI();
  }

  // Handle incoming ICE candidate
  async handleIceCandidate({ senderSocketId, candidate }) {
    let pc = this.peers.get(senderSocketId);
    
    if (!pc) {
      const firstKey = Array.from(this.peers.keys())[0];
      pc = this.peers.get(firstKey);
      if (pc) {
        this.peers.delete(firstKey);
        this.peers.set(senderSocketId, pc);
      }
    }

    if (pc) {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(e));
      } else {
        pc.pendingCandidates = pc.pendingCandidates || [];
        pc.pendingCandidates.push(candidate);
      }
    }
  }

  createPeerConnection(peerId, fileId) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });
    pc.pendingCandidates = [];

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingManager.sendIceCandidate(peerId, event.candidate);
      }
    };

    // Monitor connection drops & disconnects
    pc.onconnectionstatechange = () => {
      console.log(`[P2P] Connection state with ${peerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (fileId) {
          this.markFailed(fileId, 'Peer disconnected');
        } else {
          for (const [fId, dl] of this.activeDownloads.entries()) {
            if (dl.status !== 'complete') {
              this.markFailed(fId, 'Peer disconnected');
            }
          }
        }
      }
      this.notifyUI();
    };

    this.peers.set(peerId, pc);
    return pc;
  }

  setupDataChannel(channel, peerId, fileId) {
    channel.binaryType = 'arraybuffer';
    this.dataChannels.set(peerId, channel);

    channel.onopen = () => {
      const download = this.activeDownloads.get(fileId.toString());
      if (download) {
        download.status = 'downloading';
        // Start sequential chunk transfer from chunk 0
        this.requestChunk(channel, fileId, 0);
        this.notifyUI();
      }
    };

    // Detect channel close / peer drop
    channel.onclose = () => {
      console.warn(`[P2P] DataChannel closed with ${peerId}`);
      this.markFailed(fileId, 'Peer closed connection');
    };

    channel.onerror = (err) => {
      console.error(`[P2P] DataChannel error:`, err);
      this.markFailed(fileId, 'Channel error');
    };

    channel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.type === 'request_chunk') {
          this.handleChunkRequest(channel, msg.fileId, msg.chunkIndex);
        } else if (msg.type === 'chunk_header') {
          this.lastIncomingHeader = msg;
        } else if (msg.type === 'error') {
          console.error(`[P2P] Peer error: ${msg.message}`);
          this.markFailed(fileId, msg.message);
        }
      } else {
        // Binary payload: received chunk ArrayBuffer
        if (this.lastIncomingHeader) {
          await this.handleChunkReceived(
            event.data, 
            this.lastIncomingHeader.fileId, 
            this.lastIncomingHeader.chunkIndex, 
            channel
          );
          this.lastIncomingHeader = null;
        }
      }
    };
  }

  clearChunkTimeout(fileId) {
    const fId = fileId.toString();
    if (this.chunkTimeouts.has(fId)) {
      clearTimeout(this.chunkTimeouts.get(fId));
      this.chunkTimeouts.delete(fId);
    }
  }

  // Request a specific chunk index sequentially with stall timeout
  requestChunk(channel, fileId, chunkIndex) {
    const fId = fileId.toString();
    this.clearChunkTimeout(fId);

    // If sender drops without closing WebRTC cleanly, detect stall within 8 seconds
    const timeout = setTimeout(() => {
      console.warn(`[P2P] Chunk ${chunkIndex} request timed out for file ${fileId}`);
      this.markFailed(fileId, 'Transfer stalled (peer may have left)');
    }, 8000);
    this.chunkTimeouts.set(fId, timeout);

    channel.send(JSON.stringify({ type: 'request_chunk', fileId, chunkIndex }));
  }

  // Sender handles chunk request from receiver
  async handleChunkRequest(channel, fileId, chunkIndex) {
    const file = this.seededFiles.get(fileId.toString());
    if (!file) {
      channel.send(JSON.stringify({ type: 'error', message: 'File not in sender memory' }));
      return;
    }

    const CHUNK_SIZE = 256 * 1024;
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkBlob = file.slice(start, end);
    const buffer = await chunkBlob.arrayBuffer();
    
    channel.send(JSON.stringify({ type: 'chunk_header', chunkIndex, fileId }));
    channel.send(buffer);
  }

  // Receiver verifies the SHA-256 hash of the received chunk
  async handleChunkReceived(arrayBuffer, fileId, chunkIndex, channel) {
    const fileIdStr = fileId.toString();
    this.clearChunkTimeout(fileIdStr);

    const download = this.activeDownloads.get(fileIdStr);
    if (!download) return;

    // 1. Compute SHA-256 of the received bytes
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 2. Validate against manifest
    const manifestChunk = download.manifest.find(c => c.chunk_index === chunkIndex);
    if (manifestChunk && manifestChunk.chunk_hash === hashHex) {
      download.receivedChunks.set(chunkIndex, new Blob([arrayBuffer]));
      download.bytesReceived = (download.bytesReceived || 0) + arrayBuffer.byteLength;

      const elapsed = Math.max((Date.now() - (download.startTime || Date.now())) / 1000, 0.1);
      download.speed = Math.round(download.bytesReceived / elapsed);
      download.progress = (download.receivedChunks.size / download.manifest.length) * 100;
      this.notifyUI();

      // Sequential progression: request next chunk or finalize
      if (download.receivedChunks.size < download.manifest.length) {
        this.requestChunk(channel, fileId, chunkIndex + 1);
      } else {
        download.status = 'complete';
        download.speed = 0;
        this.clearChunkTimeout(fileIdStr);
        this.notifyUI();
        this.assembleAndDownload(download);
      }
    } else {
      console.error(`[P2P] Chunk ${chunkIndex} SHA-256 hash mismatch! Discarding corrupt chunk.`);
      // Retry chunk once
      this.requestChunk(channel, fileId, chunkIndex);
    }
  }

  // Reassemble all verified chunk Blobs and trigger browser download
  assembleAndDownload(download) {
    const chunks = [];
    for (let i = 0; i < download.manifest.length; i++) {
      chunks.push(download.receivedChunks.get(i));
    }
    const finalBlob = new Blob(chunks);
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = download.file.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const swarmManager = new SwarmManager();
