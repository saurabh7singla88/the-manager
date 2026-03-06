// Simple structured logger — prints timestamped lines to stdout/stderr.
// Usage: import logger from '../lib/logger.js';
//        logger.info('server started', { port: 3001 });
//        logger.error('db failed', err);

const ts = () => new Date().toISOString();

function format(level, msg, meta) {
  const base = `[${ts()}] ${level.padEnd(5)} ${msg}`;
  if (!meta) return base;
  if (meta instanceof Error) return `${base} — ${meta.message}${meta.stack ? `\n${meta.stack}` : ''}`;
  if (typeof meta === 'object') return `${base} ${JSON.stringify(meta)}`;
  return `${base} ${meta}`;
}

const logger = {
  info:  (msg, meta) => console.log(format('INFO',  msg, meta)),
  warn:  (msg, meta) => console.warn(format('WARN',  msg, meta)),
  error: (msg, meta) => console.error(format('ERROR', msg, meta)),
};

export default logger;
