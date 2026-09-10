# VELOX ⚡

A high-performance, decentralized peer-to-peer (P2P) file sharing application built with **WebRTC**, **Socket.IO**, **Node.js**, **PostgreSQL**, and **React**.

Files shared on VELOX **never touch the server's disk**. Instead, files are chunked and hashed directly in the browser, while the server coordinates signaling, manifests, and seeder discovery. Binary payloads are streamed directly between peers across encrypted WebRTC DataChannels.

---

## 🚀 Key Features

- **Direct Browser-to-Browser Transfer**: Zero intermediary cloud or server file storage. Transfers execute directly between peers using WebRTC DataChannels.
- **Cryptographic Chunk Verification**: Files are split into 256 KB blocks and individually validated against SHA-256 hashes defined in the file manifest.
- **Live Swarm & Network Visualization**: Interactive animated network canvas powered by `@tsparticles/react` that visualizes peer nodes and transfer activity.
- **Multi-Tab & Multi-Socket Presence**: Redis-backed seeder tracking (`user:sockets:*` and `file:seeders:*`) ensures multi-tab peers seamlessly route offers, answers, and ICE candidates without self-connection deadlock.
- **Public & Password-Protected Files**: Secure file sharing with bcrypt password hashing for private distributions.
- **Real-Time Transfer Metrics**: Active progress reporting with live transfer speed calculation and dynamic seeder discovery.

---

## 🏗️ Architecture Overview

```
                          ┌──────────────────────────┐
                          │   PostgreSQL Database    │
                          │ (Users, Files, Manifests)│
                          └─────────────▲────────────┘
                                        │
                                        ▼
┌─────────────────┐       ┌──────────────────────────┐       ┌─────────────────┐
│                 │◄─────►│    Express + Socket.IO   │◄─────►│                 │
│  Browser Peer A │       │      Signaling Node      │       │  Browser Peer B │
│    (Seeder)     │       └─────────────▲────────────┘       │   (Leecher)     │
│                 │                     │                    │                 │
│                 │       ┌─────────────▼────────────┐       │                 │
│                 │       │       Redis Store        │       │                 │
│                 │       │  (Sockets & Seeder Sets) │       │                 │
│                 │       └──────────────────────────┘       │                 │
│                 │                                          │                 │
│                 │◄════════════════════════════════════════►│                 │
└─────────────────┘       Direct WebRTC DataChannel          └─────────────────┘
                         (256 KB Chunks + SHA-256)
```

1. **Manifest Registration**: When a seeder selects a file, it is sliced into 256 KB chunks and hashed with `crypto.subtle.digest('SHA-256')`. Only the manifest is stored in PostgreSQL.
2. **Signaling & Discovery**: Socket.IO coordinates SDP offers, answers, and ICE candidate exchanges between peers.
3. **P2P Transfer**: The downloading peer requests individual chunks by index over an open WebRTC `RTCDataChannel`. Each chunk is verified immediately upon receipt before disk assembly.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, React Router 7, `@tsparticles/react`, WebRTC API, Socket.IO Client
- **Backend**: Node.js, Express 5, Socket.IO 4, `pg` (PostgreSQL client with transactions), `redis` v6, JSON Web Tokens (`jsonwebtoken`), `bcrypt`
- **Database & Cache**: PostgreSQL (Metadata & Manifests), Redis (Presence & Swarm state)
- **Deployment**: Docker Compose for containerized local services

---

## 📦 Project Structure

```
VELOX/
├── backend/
│   ├── db/
│   │   ├── migrate.js        # Automatic DB schema migration
│   │   ├── postgres.js       # PostgreSQL pool and transaction client
│   │   └── redis.js          # Redis client configuration
│   ├── middleware/
│   │   └── auth.js           # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.js           # User registration and login
│   │   └── files.js          # File manifest registration & discovery
│   ├── socket.js             # Socket.IO WebRTC signaling engine
│   ├── server.js             # Express application entrypoint
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth.jsx             # User authentication forms
│   │   │   ├── FileList.jsx         # Swarm file browser & download manager
│   │   │   ├── FileRegister.jsx     # Client-side chunking and file publishing
│   │   │   ├── SwarmVisualizer.jsx  # tsParticles interactive network canvas
│   │   │   └── Toast.jsx            # Notification toast system
│   │   ├── utils/
│   │   │   ├── SignalingManager.js  # Socket.IO signaling wrapper
│   │   │   └── SwarmManager.js      # WebRTC peer connections & chunk pipelines
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   └── package.json
└── docker-compose.yml        # PostgreSQL and Redis services
```

---

## 🚦 Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Docker](https://www.docker.com/) & Docker Compose

### 2. Start PostgreSQL and Redis

Run the provided Docker Compose configuration from the repository root:

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL**: Port `5434` (`swarmshare` database)
- **Redis**: Port `6379`

### 3. Setup and Run Backend

```bash
cd backend
npm install

# Start the server (runs migrations automatically)
npm start
```

The backend server will run on `http://localhost:3001`.

#### Environment Variables (`backend/.env`):
```env
PORT=3001
JWT_SECRET=your_jwt_secret
POSTGRES_USER=swarmshare
POSTGRES_HOST=localhost
POSTGRES_DB=swarmshare
POSTGRES_PASSWORD=password
POSTGRES_PORT=5434
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:5173
```

### 4. Setup and Run Frontend

In a separate terminal:

```bash
cd frontend
npm install

# Start the Vite development server
npm run dev
```

The frontend will run on `http://localhost:5173`.

---

## 🔒 Security & Verification

- **Integrity Guarantee**: Chunks are verified against cryptographic SHA-256 digests prior to saving, preventing corrupt or tampered payloads.
- **Authentication**: REST routes and Socket.IO signaling handshakes are secured with JWT bearer tokens.
- **Private Manifests**: Access to private file manifests requires password verification via bcrypt.

---

## 📜 License

ISC License.
