# VELOX ⚡
### Direct Browser-to-Browser File Transfer via WebRTC & Node.js

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-68a063?logo=node.js)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql)](https://www.postgresql.org/)
[![WebRTC](https://img.shields.io/badge/WebRTC-DataChannels-333333?logo=webrtc)](https://webrtc.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Signaling-010101?logo=socketdotio)](https://socket.io/)

**VELOX** is a direct peer-to-peer file transfer web application. Files are transferred directly between two browsers using **WebRTC DataChannels**, ensuring that file data never passes through or gets stored on the server's disk.

The backend coordinates authentication, file manifests in PostgreSQL, and real-time WebRTC signaling via Socket.IO, while data integrity is guaranteed through client-side SHA-256 chunk verification.

---

## 🎯 Key Features

- **Direct 1-to-1 P2P Transfer**: File payloads stream directly between sender and receiver browsers over encrypted WebRTC DataChannels.
- **Cryptographic Chunk Verification**: Files are split into 256 KB blocks in the browser. Each block is verified against a SHA-256 hash from the manifest upon receipt.
- **Socket.IO Signaling**: Real-time SDP offer/answer exchange and ICE candidate negotiation managed via Socket.IO.
- **PostgreSQL Manifest Store**: Atomically stores file metadata and chunk verification manifests using database transactions.
- **JWT & Password Protection**: Secured endpoints via JSON Web Tokens, with optional bcrypt-hashed password protection for private files.
- **Transfer Progress & Status**: Clear visual feedback showing real-time transfer progress, speed, and peer connection status.

---

## 🏗️ Architecture

```
                          ┌──────────────────────────┐
                          │   PostgreSQL Database    │
                          │ (Users, Files, Manifests)│
                          └─────────────▲────────────┘
                                        │
                                        ▼
┌─────────────────┐       ┌──────────────────────────┐       ┌─────────────────┐
│                 │◄─────►│    Node.js + Express     │◄─────►│                 │
│  Sender Browser │       │      Signaling Node      │       │ Receiver Browser│
│                 │       │       (Socket.IO)        │       │                 │
└────────┬────────┘       └──────────────────────────┘       └────────▲────────┘
         │                                                            │
         │                 Direct WebRTC DataChannel                  │
         └════════════════════════════════════════════════════════════┘
                     (256 KB Chunks • SHA-256 Verification)
```

### Data vs. Control Plane Separation
* **Control Plane (Signaling & Metadata)**: Handled by Express and Socket.IO. Authenticates users, stores file manifests in PostgreSQL, and routes connection offers/answers between peers.
* **Data Plane (Binary Transfer)**: Handled entirely by the browser. The file bytes travel directly over an `RTCDataChannel` (SCTP protocol) without touching the backend server or its database.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19, Vite | Responsive UI, file slice handling, and Web Crypto API. |
| **P2P Transport** | WebRTC (`RTCDataChannel`) | Direct browser-to-browser binary transfer. |
| **Signaling** | Node.js, Express, Socket.IO | WebRTC session negotiation (SDP offer/answer, ICE). |
| **Database** | PostgreSQL 15 | Relational storage for users, file metadata, and chunk hashes. |
| **Security** | JWT, bcrypt | User authentication and private file password protection. |

---

## 🔄 How a Transfer Works

```
1. Manifest Registration:
   Uploader slices file into 256 KB blocks -> Computes SHA-256 per chunk -> POST /api/files/register.
   Server saves file metadata & chunk hashes atomically in PostgreSQL.

2. Discovery & Signaling:
   Downloader requests manifest (POST /api/files/:id/manifest).
   Downloader emits 'webrtc-offer' targeting the uploader via Socket.IO.
   Uploader responds with 'webrtc-answer'.
   ICE candidates are exchanged to establish a direct P2P connection.

3. Binary Chunk Transfer:
   Downloader requests chunk 0 via RTCDataChannel.
   Uploader reads chunk 0 from memory/file and sends binary ArrayBuffer.
   Downloader verifies SHA-256 hash against manifest.
   On match, downloader requests chunk 1 (sequential transfer).

4. Assembly:
   Once all chunks are verified, Downloader constructs a Blob and triggers client download.
```

---

## 📐 Database Schema

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  total_size BIGINT NOT NULL,
  chunk_size INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  is_public BOOLEAN DEFAULT true,
  password_hash VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chunk_manifest (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_hash VARCHAR(64) NOT NULL,
  chunk_size INTEGER NOT NULL,
  UNIQUE(file_id, chunk_index)
);
```

---

## 🚦 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Docker](https://www.docker.com/) (for PostgreSQL)

### 2. Start PostgreSQL
```bash
docker-compose up -d
```
Starts PostgreSQL on port `5434` (database: `swarmshare`, user: `swarmshare`).

### 3. Start Backend
```bash
cd backend
npm install
npm start
```
Runs database migrations automatically and starts the server on `http://localhost:3001`.

### 4. Start Frontend
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 📡 API Reference

| Method | Endpoint | Auth | Description |
|---|---|:---:|---|
| `POST` | `/api/auth/signup` | No | Register a new user account |
| `POST` | `/api/auth/login` | No | Authenticate user & return JWT token |
| `GET` | `/api/files` | Yes | List all registered files and availability |
| `POST` | `/api/files/register` | Yes | Register a file's chunk manifest |
| `POST` | `/api/files/:id/manifest` | Yes | Retrieve chunk hashes (verifies password if private) |
| `DELETE` | `/api/files/:id` | Yes | Delete owned file and associated manifest |

---

## 💬 Interview Discussion Points & Trade-offs

* **Why WebRTC DataChannels instead of WebSockets for file transfer?**
  WebSockets require all binary data to route through the application server, consuming significant bandwidth and CPU under load. WebRTC DataChannels connect clients peer-to-peer over SCTP, using the server strictly for lightweight signaling.
* **Why chunk the file and hash each piece?**
  Sending a 500 MB file as a single payload can exhaust browser memory and cause data channel buffer congestion. Breaking files into 256 KB chunks enables flow control and per-chunk verification: if a chunk fails integrity verification, only that 256 KB piece is re-requested instead of the entire file.
* **How would this scale horizontally in production?**
  In this prototype, signaling is kept in-memory for simplicity. To run multiple backend instances, we would attach a Redis pub/sub adapter to Socket.IO so signaling events can route between instances, and add a TURN relay server (e.g. Coturn) to handle symmetric NAT environments where direct peer connections fail.
