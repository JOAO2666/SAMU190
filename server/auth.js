import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { dbGet, dbRun, publicUser } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-before-production';
const TOKEN_TTL = process.env.JWT_TTL || '7d';
const isVercel = Boolean(process.env.VERCEL);

export async function signToken(user, req) {
  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      jti: tokenId,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      provider: user.provider || 'local',
      createdAt: user.created_at,
      lastLogin: user.last_login,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );
  const decoded = jwt.decode(token);

  if (!isVercel) {
    await dbRun(`
      INSERT INTO auth_sessions (id, user_id, token_id, created_at, expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      crypto.randomUUID(),
      user.id,
      tokenId,
      new Date().toISOString(),
      new Date(Number(decoded.exp) * 1000).toISOString(),
      req?.ip || null,
      req?.get?.('user-agent') || null
    ]);
  }

  return token;
}

export async function authRequired(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Sessao necessaria.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.jti) {
      return res.status(401).json({ message: 'Sessao expirada ou invalida.' });
    }

    const session = isVercel
      ? null
      : await dbGet('SELECT * FROM auth_sessions WHERE token_id = ? AND user_id = ?', [payload.jti, payload.sub]);

    if (!isVercel && (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now())) {
      return res.status(401).json({ message: 'Sessao expirada ou invalida.' });
    }

    let user = await dbGet('SELECT * FROM users WHERE id = ?', [payload.sub]);

    if (!user && isVercel && payload.email && payload.name) {
      await dbRun(`
        INSERT OR IGNORE INTO users
          (id, name, email, password_hash, role, avatar, provider, created_at, last_login)
        VALUES
          (?, ?, ?, NULL, ?, ?, ?, ?, ?)
      `, [
        payload.sub,
        payload.name,
        payload.email,
        ['admin', 'support'].includes(payload.role) ? payload.role : 'user',
        payload.avatar || null,
        payload.provider || 'local',
        payload.createdAt || new Date().toISOString(),
        payload.lastLogin || new Date().toISOString()
      ]);
      user = await dbGet('SELECT * FROM users WHERE id = ? OR email = ?', [payload.sub, payload.email]);
    }

    if (!user) {
      return res.status(401).json({ message: 'Usuario nao encontrado.' });
    }

    // await dbRun('UPDATE users SET last_seen = ? WHERE id = ?', [new Date().toISOString(), user.id]);
    user.last_seen = new Date().toISOString();

    req.user = user;
    req.publicUser = publicUser(user);
    req.authSession = session || { id: null, token_id: payload.jti };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Sessao expirada ou invalida.', error: err.message });
  }
}

export async function revokeCurrentSession(req) {
  if (!req.authSession?.id) return;
  await dbRun('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [
    new Date().toISOString(),
    req.authSession.id
  ]);
}

export function adminRequired(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso restrito a administradores.' });
  }
  return next();
}

export function staffRequired(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'support') {
    return res.status(403).json({ message: 'Acesso restrito a administradores e suporte.' });
  }
  return next();
}
