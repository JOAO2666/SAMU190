import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { z } from 'zod';
import { authRequired, adminRequired, staffRequired, revokeCurrentSession, signToken } from './auth.js';
import { dataDir, db, logAudit, publicUser, dbGet, dbAll, dbRun } from './db.js';

const router = express.Router();
const now = () => new Date().toISOString();

const googleEnabled =
  Boolean(process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET) &&
  Boolean(process.env.GOOGLE_CALLBACK_URL);

if (googleEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(null, false);

          const existing = await dbGet(
            'SELECT * FROM users WHERE google_id = ? OR email = ?',
            [profile.id, email]
          );

          if (existing) {
            await dbRun(
              'UPDATE users SET google_id = ?, provider = ?, avatar = COALESCE(avatar, ?), last_login = ? WHERE id = ?',
              [profile.id, 'google', initials(profile.displayName), now(), existing.id]
            );

            const refreshed = await dbGet('SELECT * FROM users WHERE id = ?', [existing.id]);
            logAudit(existing.id, 'logged_in_google', 'users', existing.id);
            return done(null, { ...refreshed, is_new_user: false });
          }

          const user = {
            id: crypto.randomUUID(),
            name: profile.displayName || email.split('@')[0],
            email,
            avatar: initials(profile.displayName || email),
            created_at: now(),
          };

          await dbRun(`
            INSERT INTO users (id, name, email, password_hash, role, avatar, provider, google_id, created_at, last_login)
            VALUES (@id, @name, @email, NULL, 'user', @avatar, 'google', @google_id, @created_at, @last_login)
          `, { ...user, google_id: profile.id, last_login: user.created_at });

          const created = await dbGet('SELECT * FROM users WHERE id = ?', [user.id]);
          logAudit(user.id, 'registered_google', 'users', user.id);
          return done(null, { ...created, is_new_user: true });
        } catch (error) {
          return done(error);
        }
      },
    ),
  );
}

const passwordSchema = z
  .string()
  .min(10, 'A senha precisa ter pelo menos 10 caracteres.')
  .max(128, 'A senha deve ter no maximo 128 caracteres.')
  .regex(/[a-z]/, 'A senha precisa ter uma letra minuscula.')
  .regex(/[A-Z]/, 'A senha precisa ter uma letra maiuscula.')
  .regex(/[0-9]/, 'A senha precisa ter um numero.')
  .regex(/[^A-Za-z0-9]/, 'A senha precisa ter um caractere especial.');

const registerSchema = z.object({
  name: z.string().min(3, 'Informe seu nome completo.'),
  email: z.string().email('Informe um e-mail valido.'),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const appointmentSchema = z.object({
  userId: z.string().min(1),
  unitId: z.string().min(1),
  specialty: z.string().min(2),
  scheduledAt: z.string().min(6),
  reason: z.string().min(6),
});

const ticketSchema = z.object({
  subject: z.string().min(4),
  message: z.string().min(8),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

const profileSchema = z.object({
  cpf: z.string().min(3).optional().default(''),
  birthDate: z.string().optional().default(''),
  phone: z.string().min(3).optional().default(''),
  susCard: z.string().optional().default(''),
  address: z.string().optional().default(''),
  emergencyContact: z.string().optional().default(''),
});

const avatarSchema = z.object({
  imageData: z.string().min(1),
});

const recordSchema = z.object({
  userId: z.string().min(1),
  category: z.enum(['Geral', 'Exames', 'Medicação', 'Procedimento Cirúrgico']),
  title: z.string().min(4),
  description: z.string().min(4),
});

const triageSchema = z.object({
  queueId: z.string().min(1),
  temperature: z.string().min(1),
  sysBp: z.string().min(1),
  diaBp: z.string().min(1),
  heartRate: z.string().min(1),
  respRate: z.string().min(1),
  spo2: z.string().min(1),
  glucose: z.string().min(1),
  chiefComplaint: z.string().min(4),
  manchesterColor: z.enum(['Azul', 'Verde', 'Amarelo', 'Laranja', 'Vermelho']),
});

const queueSchema = z.object({
  userId: z.string().min(1),
  unitId: z.string().min(1),
  service: z.string().min(2),
  chiefComplaint: z.string().min(4),
});

const statusSchema = z.object({
  status: z.string().min(2),
});

const roleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

const announcementSchema = z.object({
  title: z.string().min(4, 'Informe um titulo com pelo menos 4 caracteres.').max(100),
  body: z.string().min(10, 'Informe uma mensagem com pelo menos 10 caracteres.').max(500),
  audience: z.enum(['all', 'users', 'admins']).default('all'),
});

router.get('/health', async (_req, res) => {
  res.json({ ok: true, service: 'SaudeConnect API', time: now() });
});

router.get('/bootstrap', async (_req, res) => {
  res.json({
    googleEnabled,
  });
});

router.get('/notifications', authRequired, async (req, res) => {
  const audiences =
    req.user.role === 'admin' ? ['all', 'users', 'admins'] : ['all', 'users'];
  const placeholders = audiences.map(() => '?').join(', ');
  const announcements = await dbAll(
    `SELECT * FROM announcements WHERE audience IN (${placeholders}) ORDER BY published_at DESC LIMIT 12`,
    [...audiences]
  );

  res.json({ announcements });
});

router.post('/auth/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const exists = await dbGet('SELECT id FROM users WHERE email = ?', [email]);

    if (exists) {
      return res.status(409).json({ message: 'E-mail ja cadastrado.' });
    }

    const user = {
      id: crypto.randomUUID(),
      name: input.name,
      email,
      password_hash: bcrypt.hashSync(input.password, 12),
      role: 'user',
      avatar: initials(input.name),
      created_at: now(),
      last_login: now(),
    };

    await dbRun(`
      INSERT INTO users (id, name, email, password_hash, role, avatar, provider, created_at, last_login)
      VALUES (@id, @name, @email, @password_hash, @role, @avatar, 'local', @created_at, @last_login)
    `, [user]);

    const token = await signToken(user, req);
    logAudit(user.id, 'registered', 'users', user.id);
    return res.status(201).json({ user: publicUser(user), token });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [input.email.toLowerCase()]);

    if (!user || !user.password_hash || !bcrypt.compareSync(input.password, user.password_hash)) {
      return res.status(401).json({ message: 'Credenciais invalidas.' });
    }

    await dbRun('UPDATE users SET last_login = ? WHERE id = ?', [now(), user.id]);
    await dbRun('UPDATE users SET last_seen = ? WHERE id = ?', [now(), user.id]);
    const refreshed = await dbGet('SELECT * FROM users WHERE id = ?', [user.id]);
    logAudit(user.id, 'logged_in', 'users', user.id);
    return res.json({ user: publicUser(refreshed), token: await signToken(refreshed, req) });
  } catch (error) {
    return next(error);
  }
});

router.get('/auth/google', async (req, res, next) => {
  if (!googleEnabled) {
    return res.status(503).json({
      message: 'Login Google indisponivel. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_CALLBACK_URL.',
    });
  }

  return passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

router.get(
  '/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?oauth=failed' }),
  async (req, res) => {
    const token = await signToken(req.user, req);
    const forwardedProto = req.get('x-forwarded-proto') || req.protocol;
    const forwardedHost = req.get('x-forwarded-host') || req.get('host');
    const clientUrl = process.env.CLIENT_URL || `${forwardedProto}://${forwardedHost}`;
    const params = new URLSearchParams({ token });
    if (req.user?.is_new_user) params.set('newUser', '1');
    res.redirect(`${clientUrl}/auth/callback?${params.toString()}`);
  },
);

router.get('/auth/me', authRequired, async (req, res) => {
  res.json({ user: req.publicUser });
});

router.post('/auth/avatar', authRequired, async (req, res, next) => {
  try {
    const { imageData } = avatarSchema.parse(req.body);
    const match = imageData.match(/^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/);

    if (!match) {
      return res.status(400).json({ message: 'Envie uma imagem PNG, JPG ou WebP.' });
    }

    const mimeType = match[1];
    const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(match[2], 'base64');
    const maxBytes = 2 * 1024 * 1024;

    if (buffer.length > maxBytes) {
      return res.status(400).json({ message: 'A foto deve ter no maximo 2 MB.' });
    }

    if (!isValidImageBuffer(buffer, mimeType)) {
      return res.status(400).json({ message: 'O arquivo enviado nao parece ser uma imagem valida.' });
    }

    const uploadsDir = path.join(dataDir, 'uploads', 'avatars');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const previousAvatar = req.user.avatar;
    const fileName = `${req.user.id}-${crypto.randomUUID()}.${extension}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const avatarUrl = process.env.VERCEL
      ? `/api/uploads/avatars/${fileName}`
      : `/uploads/avatars/${fileName}`;
    await dbRun('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.user.id]);

    if (/^\/(?:api\/)?uploads\/avatars\//.test(previousAvatar || '')) {
      const previousFile = path.join(
        dataDir,
        previousAvatar.replace(/^\/(?:api\/)?uploads\//, 'uploads/'),
      );
      fs.rmSync(previousFile, { force: true });
    }

    logAudit(req.user.id, 'updated_avatar', 'users', req.user.id);
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/logout', authRequired, async (req, res) => {
  revokeCurrentSession(req);
  logAudit(req.user.id, 'logged_out', 'auth_sessions', req.authSession.id);
  res.json({ ok: true });
});

router.get('/units', authRequired, async (_req, res) => {
  const units = await listUnits();
  res.json({ units });
});

router.get('/dashboard', authRequired, async (req, res) => {
  const appointments = await appointmentsForUser(req.user.id);
  const exams = await dbAll(
    'SELECT * FROM exams WHERE user_id = ? ORDER BY requested_at DESC',
    [req.user.id]
  );
  const records =
    req.user.role === 'admin' ? await allRecords() : await recordsForUser(req.user.id);
  const profile = await profileForUser(req.user.id);
  const triage = req.user.role === 'admin' ? await allTriageCases() : await triageForUser(req.user.id);
  const queue = req.user.role === 'admin' ? await allQueueEntries() : await queueForUser(req.user.id);
  const tickets = await dbAll(
    'SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id]
  );
  const units = await listUnits();
  const announcements = await dbAll(
    "SELECT * FROM announcements WHERE audience IN ('all', 'users') ORDER BY published_at DESC LIMIT 4"
  );
  const users = req.user.role === 'admin' ? await dbAll('SELECT id, name, email, role FROM users ORDER BY name ASC') : [];

  res.json({
    user: req.publicUser,
    metrics: {
      nextAppointments: appointments.filter((item) => ['pending', 'confirmed'].includes(item.status)).length,
      availableResults: exams.filter((item) => item.status.toLowerCase().includes('disponivel')).length,
      activeTickets: tickets.filter((item) => item.status !== 'resolved').length,
      connectedUnits: units.length,
      activeTriage: triage.filter((item) => item.status !== 'resolved').length,
      queuePosition: queue.find((item) => item.status === 'waiting')?.position || 0,
    },
    appointments,
    exams,
    records,
    profile,
    triage,
    queue,
    tickets,
    units,
    announcements,
    users,
  });
});

router.get('/profile', authRequired, async (req, res) => {
  res.json({ profile: await profileForUser(req.user.id) });
});

router.put('/profile', authRequired, async (req, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    await dbRun(`
      INSERT INTO patient_profiles (user_id, cpf, birth_date, phone, sus_card, address, emergency_contact, updated_at)
      VALUES (@user_id, @cpf, @birth_date, @phone, @sus_card, @address, @emergency_contact, @updated_at)
      ON CONFLICT(user_id) DO UPDATE SET
        cpf = excluded.cpf,
        birth_date = excluded.birth_date,
        phone = excluded.phone,
        sus_card = excluded.sus_card,
        address = excluded.address,
        emergency_contact = excluded.emergency_contact,
        updated_at = excluded.updated_at
    `, {
      user_id: req.user.id,
      cpf: input.cpf,
      birth_date: input.birthDate,
      phone: input.phone,
      sus_card: input.susCard,
      address: input.address,
      emergency_contact: input.emergencyContact,
      updated_at: now(),
    });

    logAudit(req.user.id, 'updated', 'patient_profiles', req.user.id);
    return res.json({ profile: await profileForUser(req.user.id) });
  } catch (error) {
    return next(error);
  }
});

router.get('/records', authRequired, async (req, res) => {
  const records = await dbAll(
    'SELECT * FROM records WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ records });
});

router.post('/records', authRequired, adminRequired, async (req, res, next) => {
  try {
    const input = recordSchema.parse(req.body);
    const targetUserId = input.userId;
    const record = {
      id: crypto.randomUUID(),
      user_id: targetUserId,
      category: input.category,
      title: input.title,
      description: input.description,
      creator_name: req.user.name,
      created_at: now(),
    };

    await dbRun(`
      INSERT INTO records (id, user_id, category, title, description, creator_name, created_at)
      VALUES (@id, @user_id, @category, @title, @description, @creator_name, @created_at)
    `, [record]);

    logAudit(req.user.id, 'created', 'records', record.id);
    return res.status(201).json({ record });
  } catch (error) {
    return next(error);
  }
});

router.get('/triage', authRequired, async (req, res) => {
  res.json({ triage: await triageForUser(req.user.id) });
});

router.post('/triage', authRequired, adminRequired, async (req, res, next) => {
  try {
    const input = triageSchema.parse(req.body);
    
    // Get original queue entry
    const queueEntry = await dbGet('SELECT * FROM queue_entries WHERE id = ?', [input.queueId]);
    if (!queueEntry) {
      return res.status(404).json({ message: 'Entrada na fila não encontrada.' });
    }

    // Determine deadline time based on Manchester Color
    const delays = {
      'Vermelho': 0,
      'Laranja': 10,
      'Amarelo': 50,
      'Verde': 120,
      'Azul': 240
    };
    const delayMinutes = delays[input.manchesterColor] || 0;
    const deadlineTime = new Date(Date.now() + delayMinutes * 60000).toISOString();
    const triageTime = now();

    const triageCase = {
      id: crypto.randomUUID(),
      user_id: queueEntry.user_id,
      queue_id: input.queueId,
      temperature: input.temperature,
      sys_bp: input.sysBp,
      dia_bp: input.diaBp,
      heart_rate: input.heartRate,
      resp_rate: input.respRate,
      spo2: input.spo2,
      glucose: input.glucose,
      chief_complaint: input.chiefComplaint,
      manchester_color: input.manchesterColor,
      status: 'resolved',
      creator_name: req.user.name,
      created_at: triageTime,
    };

    await dbRun(`
      INSERT INTO triage_cases (id, user_id, queue_id, temperature, sys_bp, dia_bp, heart_rate, resp_rate, spo2, glucose, chief_complaint, manchester_color, status, created_at, creator_name)
      VALUES (@id, @user_id, @queue_id, @temperature, @sys_bp, @dia_bp, @heart_rate, @resp_rate, @spo2, @glucose, @chief_complaint, @manchester_color, @status, @created_at, @creator_name)
    `, [triageCase]);

    // Update queue entry
    await dbRun(`
      UPDATE queue_entries 
      SET status = 'waiting_service', triage_color = ?, triage_time = ?, deadline_time = ?
      WHERE id = ?
    `, [input.manchesterColor, triageTime, deadlineTime, input.queueId]);

    logAudit(req.user.id, 'created', 'triage_cases', triageCase.id);
    return res.status(201).json({ triage: triageCase });
  } catch (error) {
    return next(error);
  }
});

router.get('/queue', authRequired, async (req, res) => {
  res.json({ queue: await queueForUser(req.user.id) });
});

router.post('/queue', authRequired, adminRequired, async (req, res, next) => {
  try {
    const input = queueSchema.parse(req.body);
    const unit = await dbGet('SELECT * FROM units WHERE id = ?', [input.unitId]);
    if (!unit) return res.status(404).json({ message: 'Unidade não encontrada.' });

    const nextPosition =
      (await dbGet(
        "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM queue_entries WHERE unit_id = ? AND status = 'waiting_triage'",
        [input.unitId]
      )).next || 1;
    
    const queueEntry = {
      id: crypto.randomUUID(),
      user_id: input.userId,
      unit_id: input.unitId,
      service: input.service,
      chief_complaint: input.chiefComplaint,
      position: nextPosition,
      estimated_minutes: nextPosition * 9 + 7,
      status: 'waiting_triage',
      created_at: now(),
    };

    await dbRun(`
      INSERT INTO queue_entries (id, user_id, unit_id, service, chief_complaint, position, estimated_minutes, status, created_at)
      VALUES (@id, @user_id, @unit_id, @service, @chief_complaint, @position, @estimated_minutes, @status, @created_at)
    `, [queueEntry]);

    logAudit(req.user.id, 'created', 'queue_entries', queueEntry.id);
    return res.status(201).json({ queue: await queueById(queueEntry.id) });
  } catch (error) {
    return next(error);
  }
});

router.post('/appointments', authRequired, adminRequired, async (req, res, next) => {
  try {
    const input = appointmentSchema.parse(req.body);
    const unit = await dbGet('SELECT * FROM units WHERE id = ?', [input.unitId]);

    if (!unit) {
      return res.status(404).json({ message: 'Unidade nao encontrada.' });
    }

    const appointment = {
      id: crypto.randomUUID(),
      user_id: input.userId,
      unit_id: input.unitId,
      specialty: input.specialty,
      professional: 'A definir',
      scheduled_at: new Date(input.scheduledAt).toISOString(),
      status: 'confirmed',
      reason: input.reason,
      notes: '',
      created_at: now(),
    };

    await dbRun(`
      INSERT INTO appointments (id, user_id, unit_id, specialty, professional, scheduled_at, status, reason, notes, created_at)
      VALUES (@id, @user_id, @unit_id, @specialty, @professional, @scheduled_at, @status, @reason, @notes, @created_at)
    `, [appointment]);

    logAudit(req.user.id, 'created', 'appointments', appointment.id);
    return res.status(201).json({ appointment: await appointmentById(appointment.id) });
  } catch (error) {
    return next(error);
  }
});


router.post('/support', authRequired, async (req, res, next) => {
  try {
    const input = ticketSchema.parse(req.body);
    const ticket = {
      id: crypto.randomUUID(),
      user_id: req.user.id,
      subject: input.subject,
      message: input.message,
      status: 'open',
      priority: input.priority,
      created_at: now(),
    };

    await dbRun(`
      INSERT INTO support_tickets (id, user_id, subject, message, status, priority, created_at)
      VALUES (@id, @user_id, @subject, @message, @status, @priority, @created_at)
    `, [ticket]);

    logAudit(req.user.id, 'created', 'support_tickets', ticket.id);
    return res.status(201).json({ ticket });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/overview', authRequired, staffRequired, async (req, res) => {
  const isSupport = req.user.role === 'support';
  const unitId = req.query.unit_id;

  let overview = {
    users: await count('users'),
    openTickets: (await dbGet("SELECT COUNT(*) AS total FROM support_tickets WHERE status != 'resolved'")).total,
    integrationsOnline: (await dbGet("SELECT COUNT(*) AS total FROM integrations WHERE status = 'online'")).total,
    appointments: 0,
    triageWaiting: 0,
    queueWaiting: 0,
  };

  if (!isSupport) {
    if (unitId) {
      overview.appointments = (await dbGet("SELECT COUNT(*) AS total FROM appointments WHERE unit_id = ?", [unitId])).total;
      overview.queueWaiting = (await dbGet(
        "SELECT COUNT(*) AS total FROM queue_entries WHERE status = 'waiting' AND unit_id = ?",
        [unitId]
      )).total;
      try {
        overview.triageWaiting = (await dbGet(
          "SELECT COUNT(*) AS total FROM triage_cases WHERE status != 'resolved' AND unit_id = ?",
          [unitId]
        )).total;
      } catch (e) {
        overview.triageWaiting = (await dbGet("SELECT COUNT(*) AS total FROM triage_cases WHERE status != 'resolved'")).total;
      }
    } else {
      overview.appointments = await count('appointments');
      overview.queueWaiting = (await dbGet("SELECT COUNT(*) AS total FROM queue_entries WHERE status = 'waiting'")).total;
      overview.triageWaiting = (await dbGet("SELECT COUNT(*) AS total FROM triage_cases WHERE status != 'resolved'")).total;
    }
  }

  const appointments = isSupport ? [] : (unitId 
    ? await dbAll(
    `SELECT appointments.*, users.name AS user_name, users.email AS user_email, units.name AS unit_name FROM appointments JOIN users ON users.id = appointments.user_id JOIN units ON units.id = appointments.unit_id WHERE appointments.unit_id = ? ORDER BY scheduled_at DESC LIMIT 12`,
    [unitId]
  )
    : await dbAll(
    `SELECT appointments.*, users.name AS user_name, users.email AS user_email, units.name AS unit_name FROM appointments JOIN users ON users.id = appointments.user_id JOIN units ON units.id = appointments.unit_id ORDER BY scheduled_at DESC LIMIT 12`
  ));

  const users = await dbAll(
    'SELECT id, name, email, role, avatar, provider, created_at, last_login, last_seen, cpf FROM users ORDER BY created_at DESC'
  );

  const tickets = await dbAll(
    `SELECT support_tickets.*, users.name AS user_name, users.email AS user_email FROM support_tickets JOIN users ON users.id = support_tickets.user_id ORDER BY created_at DESC`
  );

  let triage = [];
  if (!isSupport) {
    try {
      triage = unitId 
        ? await dbAll(
        `SELECT triage_cases.*, users.name AS user_name, users.email AS user_email FROM triage_cases JOIN users ON users.id = triage_cases.user_id WHERE triage_cases.unit_id = ? ORDER BY triage_cases.created_at DESC`,
        [unitId]
      )
        : await dbAll(
        `SELECT triage_cases.*, users.name AS user_name, users.email AS user_email FROM triage_cases JOIN users ON users.id = triage_cases.user_id ORDER BY triage_cases.created_at DESC`
      );
    } catch (e) {
      triage = await dbAll(
        `SELECT triage_cases.*, users.name AS user_name, users.email AS user_email FROM triage_cases JOIN users ON users.id = triage_cases.user_id ORDER BY triage_cases.created_at DESC`
      );
    }
  }

  const queue = isSupport ? [] : (unitId
    ? await dbAll(
    `SELECT queue_entries.*, users.name AS user_name, users.email AS user_email, units.name AS unit_name FROM queue_entries JOIN users ON users.id = queue_entries.user_id JOIN units ON units.id = queue_entries.unit_id WHERE queue_entries.unit_id = ? ORDER BY CASE queue_entries.status WHEN 'waiting_service' THEN 1 WHEN 'waiting_triage' THEN 2 ELSE 3 END ASC, CASE queue_entries.triage_color WHEN 'Vermelho' THEN 1 WHEN 'Laranja' THEN 2 WHEN 'Amarelo' THEN 3 WHEN 'Verde' THEN 4 WHEN 'Azul' THEN 5 ELSE 6 END ASC, queue_entries.deadline_time ASC, queue_entries.created_at ASC`,
    [unitId]
  )
    : await dbAll(
    `SELECT queue_entries.*, users.name AS user_name, users.email AS user_email, units.name AS unit_name FROM queue_entries JOIN users ON users.id = queue_entries.user_id JOIN units ON units.id = queue_entries.unit_id ORDER BY CASE queue_entries.status WHEN 'waiting_service' THEN 1 WHEN 'waiting_triage' THEN 2 ELSE 3 END ASC, CASE queue_entries.triage_color WHEN 'Vermelho' THEN 1 WHEN 'Laranja' THEN 2 WHEN 'Amarelo' THEN 3 WHEN 'Verde' THEN 4 WHEN 'Azul' THEN 5 ELSE 6 END ASC, queue_entries.deadline_time ASC, queue_entries.created_at ASC`
  ));

  const integrations = await dbAll('SELECT * FROM integrations ORDER BY name');
  const announcements = await dbAll('SELECT * FROM announcements ORDER BY published_at DESC LIMIT 8');
  const units = await dbAll('SELECT * FROM units ORDER BY name ASC');
  
  const auditLogs = await dbAll(
    `SELECT audit_logs.*, users.name AS actor_name FROM audit_logs LEFT JOIN users ON users.id = audit_logs.actor_id ORDER BY audit_logs.created_at DESC LIMIT 10`
  );
  
  const records = isSupport ? [] : await dbAll(
    `SELECT records.*, users.name AS user_name, users.email AS user_email FROM records JOIN users ON users.id = records.user_id ORDER BY records.created_at DESC LIMIT 20`
  );

  res.json({ overview, appointments, users, tickets, triage, queue, integrations, announcements, auditLogs, records, units });
});

router.post('/admin/users', authRequired, adminRequired, async (req, res, next) => {
  try {
    const { name, email, password, cpf } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nome, email e senha sao obrigatorios.' });
    }
    
    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ message: 'Este email ja esta em uso.' });
    }

    const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const hash = bcrypt.hashSync(password, 12);
    const nowStr = now();

    await dbRun(`
      INSERT INTO users (id, name, email, password_hash, role, provider, created_at, last_seen, cpf)
      VALUES (@id, @name, @email, @password_hash, 'user', 'local', @created_at, @last_seen, @cpf)
    `, {
      id,
      name,
      email,
      password_hash: hash,
      created_at: nowStr,
      last_seen: nowStr,
      cpf: cpf || null,
    });

    logAudit(req.user.id, 'created', 'users', id);
    return res.status(201).json({ message: 'Usuario criado com sucesso.' });
  } catch (error) {
    return next(error);
  }
});

router.patch('/admin/users/:id/role', authRequired, adminRequired, async (req, res, next) => {
  try {
    const input = roleSchema.parse(req.body);
    if (req.params.id === req.user.id && input.role !== 'admin') {
      return res.status(400).json({ message: 'Voce nao pode remover sua propria permissao de administrador.' });
    }

    const result = await dbRun('UPDATE users SET role = ? WHERE id = ?', [input.role, req.params.id]);
    if (result.changes === 0) return res.status(404).json({ message: 'Usuario nao encontrado.' });

    logAudit(req.user.id, 'updated_role', 'users', req.params.id);
    return res.json({ user: publicUser(await dbGet('SELECT * FROM users WHERE id = ?', [req.params.id])) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/admin/users/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'Voce nao pode excluir sua propria conta.' });
    }
    const result = await dbRun('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ message: 'Usuario nao encontrado.' });
    
    logAudit(req.user.id, 'deleted_user', 'users', req.params.id);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/admin/announcements', authRequired, adminRequired, async (req, res, next) => {
  try {
    const input = announcementSchema.parse(req.body);
    const announcement = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      body: input.body.trim(),
      audience: input.audience,
      published_at: now(),
    };

    await dbRun(`
      INSERT INTO announcements (id, title, body, audience, published_at)
      VALUES (@id, @title, @body, @audience, @published_at)
    `, [announcement]);
    logAudit(req.user.id, 'published', 'announcements', announcement.id);
    return res.status(201).json({ announcement });
  } catch (error) {
    return next(error);
  }
});

router.patch('/admin/appointments/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    const input = statusSchema.parse(req.body);
    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(input.status)) {
      return res.status(400).json({ message: 'Status de agendamento invalido.' });
    }

    const result = await dbRun(
      'UPDATE appointments SET status = ? WHERE id = ?',
      [input.status, req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ message: 'Agendamento nao encontrado.' });

    logAudit(req.user.id, 'updated_status', 'appointments', req.params.id);
    return res.json({ appointment: await appointmentById(req.params.id) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/admin/appointments/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    const result = await dbRun('DELETE FROM appointments WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ message: 'Agendamento nao encontrado.' });
    
    logAudit(req.user.id, 'deleted_appointment', 'appointments', req.params.id);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.patch('/admin/tickets/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    const input = statusSchema.parse(req.body);
    if (!['open', 'in_review', 'resolved'].includes(input.status)) {
      return res.status(400).json({ message: 'Status de chamado invalido.' });
    }

    const result = await dbRun(
      'UPDATE support_tickets SET status = ? WHERE id = ?',
      [input.status, req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ message: 'Chamado nao encontrado.' });

    logAudit(req.user.id, 'updated_status', 'support_tickets', req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.patch('/admin/integrations/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    const input = statusSchema.parse(req.body);
    if (!['online', 'degraded', 'offline'].includes(input.status)) {
      return res.status(400).json({ message: 'Status de integracao invalido.' });
    }

    const latency = Math.floor(90 + Math.random() * 720);
    const result = await dbRun(
      'UPDATE integrations SET status = ?, last_sync = ?, latency_ms = ? WHERE id = ?',
      [input.status, now(), latency, req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ message: 'Integracao nao encontrada.' });

    logAudit(req.user.id, 'updated_status', 'integrations', req.params.id);
    return res.json({ integration: await dbGet('SELECT * FROM integrations WHERE id = ?', [req.params.id]) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/admin/triage/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    const input = statusSchema.parse(req.body);
    if (!['waiting', 'in_service', 'resolved'].includes(input.status)) {
      return res.status(400).json({ message: 'Status de triagem inválido.' });
    }

    const result = await dbRun(
      'UPDATE triage_cases SET status = ? WHERE id = ?',
      [input.status, req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ message: 'Triagem não encontrada.' });

    logAudit(req.user.id, 'updated_status', 'triage_cases', req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.patch('/admin/queue/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    const input = statusSchema.parse(req.body);
    if (!['waiting_triage', 'waiting_service', 'called', 'done', 'cancelled'].includes(input.status)) {
      return res.status(400).json({ message: 'Status de fila inválido.' });
    }

    const result = await dbRun(
      'UPDATE queue_entries SET status = ? WHERE id = ?',
      [input.status, req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ message: 'Entrada de fila não encontrada.' });

    logAudit(req.user.id, 'updated_status', 'queue_entries', req.params.id);
    return res.json({ queue: await queueById(req.params.id) });
  } catch (error) {
    return next(error);
  }
});

async function appointmentsForUser(userId) {
  return await dbAll(`
      SELECT appointments.*, units.name AS unit_name, units.district AS unit_district, units.phone AS unit_phone
      FROM appointments
      JOIN units ON units.id = appointments.unit_id
      WHERE appointments.user_id = ?
      ORDER BY scheduled_at ASC
    `, [userId]);
}

async function appointmentById(id) {
  return await dbGet(`
      SELECT appointments.*, users.name AS user_name, users.email AS user_email, units.name AS unit_name
      FROM appointments
      JOIN users ON users.id = appointments.user_id
      JOIN units ON units.id = appointments.unit_id
      WHERE appointments.id = ?
    `, [id]);
}

async function listUnits() {
  return (await dbAll('SELECT * FROM units ORDER BY distance_km ASC, name ASC'))
    .map(normalizeUnit);
}

function normalizeUnit(unit) {
  return {
    ...unit,
    services: JSON.parse(unit.services),
    distance_km: Number(unit.distance_km),
    lat: Number(unit.lat),
    lng: Number(unit.lng),
  };
}

function isValidImageBuffer(buffer, mimeType) {
  if (mimeType === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  }

  if (mimeType === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  return false;
}

async function profileForUser(userId) {
  return ((await dbGet('SELECT * FROM patient_profiles WHERE user_id = ?', [userId])) || {
    user_id: userId,
    cpf: '',
    birth_date: '',
    phone: '',
    sus_card: '',
    address: '',
    emergency_contact: '',
    updated_at: now(),
  });
}

async function triageForUser(userId) {
  return await dbAll(
    'SELECT * FROM triage_cases WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
}

async function allTriageCases() {
  return await dbAll(`
      SELECT triage_cases.*, users.name AS user_name, users.email AS user_email
      FROM triage_cases
      JOIN users ON users.id = triage_cases.user_id
      ORDER BY triage_cases.created_at DESC
    `);
}

async function recordsForUser(userId) {
  return await dbAll(
    'SELECT * FROM records WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
}

async function allRecords() {
  return await dbAll(`
      SELECT records.*, users.name AS user_name, users.email AS user_email
      FROM records
      JOIN users ON users.id = records.user_id
      ORDER BY records.created_at DESC
    `);
}

async function allQueueEntries() {
  return await dbAll(
    `SELECT queue_entries.*, users.name AS user_name, users.email AS user_email, units.name AS unit_name, units.address AS unit_address FROM queue_entries JOIN users ON users.id = queue_entries.user_id JOIN units ON units.id = queue_entries.unit_id WHERE queue_entries.status != 'done' ORDER BY CASE queue_entries.status WHEN 'waiting_service' THEN 1 WHEN 'waiting_triage' THEN 2 ELSE 3 END ASC, CASE queue_entries.triage_color WHEN 'Vermelho' THEN 1 WHEN 'Laranja' THEN 2 WHEN 'Amarelo' THEN 3 WHEN 'Verde' THEN 4 WHEN 'Azul' THEN 5 ELSE 6 END ASC, queue_entries.deadline_time ASC, queue_entries.created_at ASC`
  );
}

async function queueForUser(userId) {
  return await dbAll(`
      SELECT queue_entries.*, units.name AS unit_name, units.address AS unit_address
      FROM queue_entries
      JOIN units ON units.id = queue_entries.unit_id
      WHERE queue_entries.user_id = ? AND queue_entries.status != 'done'
      ORDER BY queue_entries.status IN ('waiting_triage', 'waiting_service') DESC, queue_entries.created_at DESC
    `, [userId]);
}

async function queueById(id) {
  return await dbGet(`
      SELECT queue_entries.*, users.name AS user_name, units.name AS unit_name, units.address AS unit_address
      FROM queue_entries
      JOIN users ON users.id = queue_entries.user_id
      JOIN units ON units.id = queue_entries.unit_id
      WHERE queue_entries.id = ?
    `, [id]);
}

function recommendationForRisk(riskLevel) {
  return {
    low: 'Prioridade verde. Acompanhe sintomas e procure atendimento de rotina.',
    medium: 'Prioridade amarela. Procure uma unidade próxima ou aguarde chamada da equipe.',
    high: 'Prioridade laranja. Atendimento prioritário recomendado ainda hoje.',
    critical: 'Prioridade vermelha. Procure emergência imediatamente ou ligue 192.',
  }[riskLevel];
}

async function count(table) {
  return (await dbGet(`SELECT COUNT(*) AS total FROM ${table}`)).total;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default router;
