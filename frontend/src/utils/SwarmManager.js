import { signalingManager } from './SignalingManager';

export class SwarmManager {
  constructor() {
    this.peers = new Map(); 
    this.dataChannels = new Map();
    this.seededFiles = new Map();
    this.activeDownloads = new Map();
    this.listeners = [];

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

  startSeeding(fileId, fileBlob) {
    this.seededFiles.set(fileId.toString(), fileBlob);
    signalingManager.announceSeeding(fileId);
    console.log(`Now seeding file ${fileId}`);
    this.notifyUI();
  }

  async startDownload(file, chunksManifest, seeders) {
    const fileIdStr = file.id.toString();
    if (this.activeDownloads.has(fileIdStr)) return;

    this.activeDownloads.set(fileIdStr, {
      file,
      manifest: chunksManifest,
      receivedChunks: new Map(),
      status: 'connecting',
      progress: 0
    });
    this.notifyUI();

    if (seeders && seeders.length > 0) {
      this.connectToPeer(seeders[0], file.id);
    } else {
      console.error('No seeders available for file', file.id);
      this.activeDownloads.get(fileIdStr).status = 'failed (no seeders)';
      this.notifyUI();
    }
  }

  async connectToPeer(targetUserId, fileId) {
    // For simplicity, we use the targetUserId as the map key temporarily. 
    // It will be replaced with socketId during handshake.
    const pc = this.createPeerConnection(targetUserId);
    const dc = pc.createDataChannel(`transfer-${fileId}`);
    this.setupDataChannel(dc, targetUserId, fileId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    signalingManager.sendOffer(targetUserId, offer, fileId);
    this.notifyUI();
  }

  async handleOffer({ senderUserId, senderSocketId, offer, fileId }) {
    console.log(`Received offer from ${senderSocketId}`);
    const pc = this.createPeerConnection(senderSocketId);

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

  async handleAnswer({ senderSocketId, answer }) {
    // We need to find the PC we initiated. In our simple mapping, it might be under targetUserId.
    // For this prototype, we'll assume the first PC is the one we want.
    let pc = this.peers.get(senderSocketId);
    if (!pc) {
      const firstKey = Array.from(this.peers.keys())[0];
      pc = this.peers.get(firstKey);
      this.peers.delete(firstKey);
      this.peers.set(senderSocketId, pc);
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

  createPeerConnection(peerId) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pc.pendingCandidates = [];

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingManager.sendIceCandidate(peerId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerId}: ${pc.connectionState}`);
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
        this.requestChunk(channel, fileId, 0); // Start requesting chunks
        this.notifyUI();
      }
    };

    channel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.type === 'request_chunk') {
          this.handleChunkRequest(channel, msg.fileId, msg.chunkIndex);
        } else if (msg.type === 'chunk_header') {
          this.lastIncomingHeader = msg;
        }
      } else {
        // Binary payload
        if (this.lastIncomingHeader) {
          await this.handleChunkReceived(event.data, this.lastIncomingHeader.fileId, this.lastIncomingHeader.chunkIndex, channel);
          this.lastIncomingHeader = null;
        }
      }
    };
  }

  requestChunk(channel, fileId, chunkIndex) {
    channel.send(JSON.stringify({ type: 'request_chunk', fileId, chunkIndex }));
  }

  async handleChunkRequest(channel, fileId, chunkIndex) {
    const file = this.seededFiles.get(fileId.toString());
    if (!file) return;

    const CHUNK_SIZE = 256 * 1024;
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkBlob = file.slice(start, end);
    const buffer = await chunkBlob.arrayBuffer();
    
    channel.send(JSON.stringify({ type: 'chunk_header', chunkIndex, fileId }));
    channel.send(buffer);
  }

  async handleChunkReceived(arrayBuffer, fileId, chunkIndex, channel) {
    const fileIdStr = fileId.toString();
    const download = this.activeDownloads.get(fileIdStr);
    if (!download) return;

    // 1. Verify Hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const manifestChunk = download.manifest.find(c => c.chunk_index === chunkIndex);
    if (manifestChunk && manifestChunk.chunk_hash === hashHex) {
      console.log(`Chunk ${chunkIndex} verified.`);
      download.receivedChunks.set(chunkIndex, new Blob([arrayBuffer]));
      
      download.progress = (download.receivedChunks.size / download.manifest.length) * 100;
      this.notifyUI();

      // Request next chunk or finish
      if (download.receivedChunks.size < download.manifest.length) {
        this.requestChunk(channel, fileId, chunkIndex + 1);
      } else {
        download.status = 'complete';
        this.notifyUI();
        this.assembleAndDownload(download);
      }
    } else {
      console.error(`Chunk ${chunkIndex} hash mismatch!`);
      // Re-request chunk or disconnect bad peer
    }
  }

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
