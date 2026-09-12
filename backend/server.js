const express = require('express');
const cors = require('cors');
const http = require('http');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const filesRoutes = require('./routes/files');
const setupSocketIO = require('./socket');

const app = express();
const server = http.createServer(app);
const io = setupSocketIO(server);

const port = process.env.PORT || 3001;

// Middleware
const allowedOrigins = process.env.FRONTEND_URL 
  ? [process.env.FRONTEND_URL, 'http://localhost:5173'] 
  : ['http://localhost:5173'];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ name: 'VELOX Signaling API', version: '1.0.0', status: 'online' });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Catch-all 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
