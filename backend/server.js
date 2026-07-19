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
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
