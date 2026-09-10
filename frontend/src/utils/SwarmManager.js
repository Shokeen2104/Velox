import { signalingManager } from './SignalingManager';

export class SwarmManager {
  constructor() {
    this.peers = new Map(); 
    this.dataChannels = new Map();
    this.seededFiles = new Map();
    this.activeDownloads = new Map();
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

  startSeeding(fileId, fileBlob) {
    this.seededFiles.set(fileId.toString(), fileBlob);
    signalingManager.announceSeeding(fileId);
    console.log(`Now seeding file ${fileId}`);
    this.notifyUI();
  }

  async startDownload(file, chunksManifest, seeders) {
    const fileIdStr = file.id.toString();
    console.log(`[SwarmManager] startDownload called for file ${fileIdStr} (${file.file_name})`);
    console.log(`[SwarmManager] seeders:`, seeders);
    console.log(`[SwarmManager] seededFiles keys:`, Array.from(this.seededFiles.keys()));
    console.log(`[SwarmManager] activeDownloads keys:`, Array.from(this.activeDownloads.keys()));

    if (this.activeDownloads.has(fileIdStr)) {
      console.log(`[SwarmManager] Download already active for ${fileIdStr}, skipping.`);
      return;
    }

    // If we already have this file in memory (we are the seeder), download directly
    const seededFile = this.seededFiles.get(fileIdStr);
    if (seededFile) {
      console.log(`[SwarmManager] File ${fileIdStr} found in local memory, downloading directly.`);
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

    console.log(`[SwarmManager] File NOT in local memory, starting P2P download...`);

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

    if (seeders && seeders.length > 0) {
      console.log(`[SwarmManager] Connecting to seeder: ${seeders[0]}`);
      this.connectToPeer(seeders[0], file.id);

      // Timeout: if still 'connecting' after 10s, the peer is unreachable
      setTimeout(() => {
        const dl = this.activeDownloads.get(fileIdStr);
        if (dl && dl.status === 'connecting') {
          console.error(`[SwarmManager] Connection timeout for file ${fileIdStr}`);
          dl.status = 'failed (seeder unreachable — they may need to re-upload the file)';
          this.notifyUI();
        }
      }, 10000);
    } else {
      console.error('[SwarmManager] No seeders available for file', file.id);
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

  async handleOffer({ _senderUserId, senderSocketId, offer, fileId }) {
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
        } else if (msg.type === 'error') {
          console.error(`Peer error: ${msg.message}`);
          const download = this.activeDownloads.get(fileId.toString());
          if (download) {
            download.status = `failed (${msg.message})`;
            this.notifyUI();
          }
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
    if (!file) {
      channel.send(JSON.stringify({ type: 'error', message: 'File not in memory on this peer' }));
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
      download.bytesReceived = (download.bytesReceived || 0) + arrayBuffer.byteLength;

      const elapsed = Math.max((Date.now() - (download.startTime || Date.now())) / 1000, 0.1);
      download.speed = Math.round(download.bytesReceived / elapsed);
      
      download.progress = (download.receivedChunks.size / download.manifest.length) * 100;
      this.notifyUI();

      // Request next chunk or finish
      if (download.receivedChunks.size < download.manifest.length) {
        this.requestChunk(channel, fileId, chunkIndex + 1);
      } else {
        download.status = 'complete';
        download.speed = 0;
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
