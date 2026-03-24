import { appendFileSync } from 'fs';

function writeServerLog(msg) {
  if (process.env.SERVER_LOG_PATH) {
    try { appendFileSync(process.env.SERVER_LOG_PATH, msg + '\n'); } catch (_) {}
  }
}

export const errorHandler = (err, req, res, next) => {
  const errMsg = `[${new Date().toISOString()}] ${req.method} ${req.path} — ${err?.stack || String(err)}`;
  console.error('Error:', err);
  writeServerLog(errMsg);

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(400).json({
      error: 'A record with this unique field already exists'
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Record not found'
    });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
};
