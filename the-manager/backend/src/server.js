import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import initiativeRoutes from './routes/initiatives.js';
import userRoutes from './routes/users.js';
import canvasRoutes from './routes/canvases.js';
import brainstormRoutes from './routes/brainstorm.js';
import aiRoutes from './routes/ai.js';
import notesRoutes from './routes/notes.js';
import gmailRoutes from './routes/gmail.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Electron file:// sends Origin: null, or same-origin server calls)
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/initiatives', initiativeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/canvases', canvasRoutes);
app.use('/api/brainstorm', brainstormRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/gmail', gmailRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// Export for Electron (starts the server and resolves when listening)
export function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

// Auto-start when run directly (not imported by Electron)
if (process.env.ELECTRON !== 'true') {
  startServer();
}
