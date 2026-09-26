import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';
import http from 'node:http';
import router from './routes.js';
import samuRouter from './samuRoutes.js';
import { setupSamuSocket } from './samuSocket.js';
import { dataDir, initDb } from './db.js';

initDb();

const app = express();
const httpServer = http.createServer(app);
const port = Number(process.env.PORT || 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

const allowedOrigins = (
  process.env.CLIENT_ORIGIN ||
  `http://localhost:5173,http://localhost:${port},http://localhost,capacitor://localhost,ionic://localhost`
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = (req, callback) => {
  const origin = req.get('origin');

  if (!origin || allowedOrigins.includes(origin) || isSameHostOrigin(req, origin) || isDemoTunnelOrigin(origin)) {
    return callback(null, { origin: true, credentials: true });
  }

  return callback(new Error('Origem nao autorizada por CORS.'));
};

function isSameHostOrigin(req, origin) {
  try {
    const originUrl = new URL(origin);
    const hosts = [req.get('host'), req.get('x-forwarded-host')].filter(Boolean);
    return hosts.includes(originUrl.host);
  } catch {
    return false;
  }
}

function isDemoTunnelOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return ['.serveousercontent.com', '.loca.lt', '.trycloudflare.com'].some((suffix) =>
      hostname.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/api', cors(corsOptions), router);
app.use('/api/samu', cors(corsOptions), samuRouter);

setupSamuSocket(httpServer, corsOptions);

app.use('/uploads', express.static(path.join(dataDir, 'uploads')));
app.use('/api/uploads', express.static(path.join(dataDir, 'uploads')));
app.use(express.static(distDir));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(distDir, 'index.html'), (error) => {
      if (error) next();
    });
  }
  return next();
});

app.use((error, _req, res, _next) => {
  if (error?.issues) {
    const firstMessage = error.issues.find((issue) => issue?.message)?.message;
    return res.status(400).json({ message: firstMessage || 'Dados invalidos.', details: error.issues });
  }

  if (error?.message?.includes('CORS')) {
    return res.status(403).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({ message: 'Erro interno no servidor.' });
});

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  httpServer.listen(port, () => {
    console.log(`SAMU 190 / SaudeConnect API + WebSockets rodando em http://localhost:${port}`);
  });
}

export { app, httpServer };
export default app;
