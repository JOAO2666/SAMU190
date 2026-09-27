import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createClient } from '@libsql/client';

const defaultDataDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'saudeconnect-data')
  : path.resolve(process.cwd(), 'data');

export const dataDir = process.env.DATA_DIR || defaultDataDir;

if (!process.env.TURSO_DATABASE_URL) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${path.join(dataDir, 'saudeconnect.sqlite')}`,
  authToken: process.env.TURSO_AUTH_TOKEN
});

function normalizeArgs(args) {
  if (Array.isArray(args) && args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0]) && !(args[0] instanceof Date)) {
    return args[0];
  }
  return args;
}

export async function dbGet(sql, args = []) {
  const result = await db.execute({ sql, args: normalizeArgs(args) });
  return result.rows[0];
}

export async function dbAll(sql, args = []) {
  const result = await db.execute({ sql, args: normalizeArgs(args) });
  return result.rows;
}

export async function dbRun(sql, args = []) {
  const result = await db.execute({ sql, args: normalizeArgs(args) });
  return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
}

const now = () => new Date().toISOString();

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    samu_role: user.samu_role || (user.role === 'admin' ? 'doctor' : 'citizen'),
    phone: user.phone || null,
    avatar: user.avatar,
    provider: user.provider,
    createdAt: user.created_at,
    lastLogin: user.last_login,
    lastSeen: user.last_seen || user.last_login || null,
  };
}

export async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('user', 'admin', 'support')) DEFAULT 'user',
      avatar TEXT,
      provider TEXT NOT NULL DEFAULT 'local',
      google_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      last_login TEXT,
      cpf TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_id ON auth_sessions(token_id);

    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL,
      services TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      specialty TEXT NOT NULL,
      professional TEXT,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')) DEFAULT 'pending',
      reason TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id)
    );

    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      unit TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      status TEXT NOT NULL,
      result_url TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS patient_profiles (
      user_id TEXT PRIMARY KEY,
      cpf TEXT,
      birth_date TEXT,
      phone TEXT,
      sus_card TEXT,
      address TEXT,
      emergency_contact TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS triage_cases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      queue_id TEXT NOT NULL,
      temperature TEXT,
      sys_bp TEXT,
      dia_bp TEXT,
      heart_rate TEXT,
      resp_rate TEXT,
      spo2 TEXT,
      glucose TEXT,
      chief_complaint TEXT NOT NULL,
      manchester_color TEXT NOT NULL CHECK (manchester_color IN ('Azul', 'Verde', 'Amarelo', 'Laranja', 'Vermelho')),
      status TEXT NOT NULL DEFAULT 'resolved',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (queue_id) REFERENCES queue_entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS queue_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      service TEXT NOT NULL,
      chief_complaint TEXT,
      position INTEGER NOT NULL,
      estimated_minutes INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('waiting_triage', 'waiting_service', 'called', 'done', 'cancelled')) DEFAULT 'waiting_triage',
      triage_color TEXT,
      triage_time TEXT,
      deadline_time TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id)
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'in_review', 'resolved')) DEFAULT 'open',
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT NOT NULL CHECK (audience IN ('all', 'users', 'admins')) DEFAULT 'all',
      published_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('online', 'degraded', 'offline')) DEFAULT 'online',
      last_sync TEXT NOT NULL,
      latency_ms INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ambulances (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      plate TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('USA', 'USB', 'VIR', 'MOTOLANCIA')),
      status TEXT NOT NULL CHECK (status IN ('offline', 'available', 'busy', 'maintenance')) DEFAULT 'offline',
      current_driver_id TEXT REFERENCES users(id),
      current_driver_name TEXT,
      current_lat REAL,
      current_lng REAL,
      current_heading REAL DEFAULT 0,
      speed REAL DEFAULT 0,
      last_ping_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emergency_calls (
      id TEXT PRIMARY KEY,
      citizen_id TEXT REFERENCES users(id),
      citizen_name TEXT,
      citizen_phone TEXT,
      ambulance_id TEXT REFERENCES ambulances(id),
      driver_id TEXT REFERENCES users(id),
      driver_name TEXT,
      target_hospital_id TEXT,
      target_hospital_name TEXT,
      status TEXT NOT NULL CHECK (status IN (
        'requested', 'searching', 'offered', 'dispatched', 'en_route_pickup',
        'arrived_scene', 'transporting', 'arrived_hospital', 'completed', 'cancelled'
      )) DEFAULT 'requested',
      severity_color TEXT NOT NULL CHECK (severity_color IN ('Azul', 'Verde', 'Amarelo', 'Laranja', 'Vermelho')),
      chief_complaint TEXT NOT NULL,
      symptoms_summary TEXT,
      patient_name TEXT,
      patient_age INTEGER,
      patient_conscious INTEGER DEFAULT 1,
      patient_breathing INTEGER DEFAULT 1,
      pickup_lat REAL NOT NULL,
      pickup_lng REAL NOT NULL,
      pickup_address TEXT NOT NULL,
      destination_lat REAL,
      destination_lng REAL,
      destination_address TEXT,
      eta_minutes INTEGER,
      distance_km REAL,
      requested_at TEXT NOT NULL,
      accepted_at TEXT,
      arrived_scene_at TEXT,
      left_scene_at TEXT,
      arrived_hospital_at TEXT,
      completed_at TEXT,
      cancellation_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS telemetry_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emergency_call_id TEXT REFERENCES emergency_calls(id) ON DELETE CASCADE,
      ambulance_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      speed REAL,
      heading REAL,
      recorded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emergency_messages (
      id TEXT PRIMARY KEY,
      emergency_call_id TEXT NOT NULL REFERENCES emergency_calls(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS baph_records (
      id TEXT PRIMARY KEY,
      emergency_call_id TEXT NOT NULL UNIQUE REFERENCES emergency_calls(id) ON DELETE CASCADE,
      glasgow_score INTEGER,
      systolic_bp INTEGER,
      diastolic_bp INTEGER,
      heart_rate INTEGER,
      oxygen_saturation INTEGER,
      respiratory_rate INTEGER,
      procedures_performed TEXT,
      observations TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await ensureColumn('units', 'distance_km', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn('units', 'hours', "TEXT NOT NULL DEFAULT 'Seg-Sex: 7h às 17h'");
  await ensureColumn('units', 'lat', 'REAL NOT NULL DEFAULT -23.5505');
  await ensureColumn('units', 'lng', 'REAL NOT NULL DEFAULT -46.6333');
  await ensureColumn('units', 'total_beds', 'INTEGER NOT NULL DEFAULT 20');
  await ensureColumn('units', 'available_beds', 'INTEGER NOT NULL DEFAULT 5');
  await ensureColumn('units', 'specialties', "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn('users', 'last_seen', 'TEXT');
  await ensureColumn('users', 'cpf', 'TEXT');
  await ensureColumn('users', 'phone', 'TEXT');
  await ensureColumn('users', 'samu_role', "TEXT DEFAULT 'citizen'");
  await ensureColumn('triage_cases', 'creator_name', 'TEXT');
  await ensureColumn('triage_cases', 'unit_id', 'TEXT');
  await ensureColumn('records', 'creator_name', 'TEXT');
  // SAMU 190 — compatibilidade com esquema da especificação (§5)
  await ensureColumn('ambulances', 'phone', 'TEXT');
  await ensureColumn('ambulances', 'driver_name', 'TEXT');
  await ensureColumn('emergency_calls', 'chest_pain', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('emergency_calls', 'unconscious', 'INTEGER');
  await ensureColumn('emergency_calls', 'not_breathing', 'INTEGER');
  await ensureColumn('emergency_calls', 'destination_hospital_id', 'TEXT');
  await ensureColumn('emergency_calls', 'phone', 'TEXT');
  await ensureColumn('telemetry_logs', 'call_id', 'TEXT');
  await ensureColumn('telemetry_logs', 'timestamp', 'TEXT');
  await ensureColumn('emergency_messages', 'role', 'TEXT');
  await ensureColumn('emergency_messages', 'text', 'TEXT');
  await ensureColumn('emergency_messages', 'timestamp', 'TEXT');
  await ensureColumn('baph_records', 'o2_sat', 'INTEGER');
  await ensureColumn('baph_records', 'notes', 'TEXT');
  await ensureColumn('baph_records', 'filled_by', 'TEXT');
  await ensureColumn('baph_records', 'filled_at', 'TEXT');

  await seedDb();
}

async function ensureColumn(table, column, definition) {
  try {
    const result = await db.execute(`PRAGMA table_info(${table})`);
    const columns = result.rows.map((item) => (item?.name ?? item?.[1]));
    if (!columns.includes(column)) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  } catch (err) {
    if (!err?.message?.includes('duplicate column')) {
      console.warn(`[ensureColumn] Aviso ao adicionar coluna ${column} na tabela ${table}:`, err.message);
    }
  }
}

async function seedDb() {
  const seedTime = now();
  await upsertUser({
    id: 'usr_admin',
    name: 'Administrador',
    email: 'admin@saudeconnect.com',
    password_hash: bcrypt.hashSync('Admin@12345', 12),
    role: 'admin',
    avatar: 'AD',
    created_at: seedTime,
    last_login: seedTime,
    last_seen: seedTime,
  });

  await upsertUser({
    id: 'usr_paciente',
    name: 'Paciente',
    email: 'paciente@saudeconnect.com',
    password_hash: bcrypt.hashSync('Paciente@12345', 12),
    role: 'user',
    avatar: 'PA',
    created_at: seedTime,
    last_login: seedTime,
    last_seen: seedTime,
  });

  // SAMU 190 Seed Users
  await upsertUser({
    id: 'usr_samu_citizen',
    name: 'José da Silva (Cidadão)',
    email: 'paciente@samu190.gov.br',
    password_hash: bcrypt.hashSync('Samu@12345', 12),
    role: 'user',
    samu_role: 'citizen',
    phone: '(87) 99988-1901',
    avatar: 'JS',
    created_at: seedTime,
    last_login: seedTime,
    last_seen: seedTime,
  });

  await upsertUser({
    id: 'usr_samu_driver',
    name: 'Socorrista Silva (SAMU)',
    email: 'socorrista@samu190.gov.br',
    password_hash: bcrypt.hashSync('Samu@12345', 12),
    role: 'user',
    samu_role: 'driver',
    phone: '(87) 99988-1902',
    avatar: 'SS',
    created_at: seedTime,
    last_login: seedTime,
    last_seen: seedTime,
  });

  await upsertUser({
    id: 'usr_samu_doctor',
    name: 'Dr. Marcos (Regulador 192)',
    email: 'regulador@samu190.gov.br',
    password_hash: bcrypt.hashSync('Samu@12345', 12),
    role: 'admin',
    samu_role: 'doctor',
    phone: '(87) 99988-1903',
    avatar: 'DM',
    created_at: seedTime,
    last_login: seedTime,
    last_seen: seedTime,
  });

  const ambulancesData = [
    {
      id: 'amb_usa_01',
      code: 'USA-01',
      plate: 'BRA-1901',
      type: 'USA',
      status: 'available',
      current_driver_id: 'usr_samu_driver',
      current_driver_name: 'Socorrista Silva',
      current_lat: -9.3950,
      current_lng: -40.5050,
      current_heading: 45,
      speed: 0,
      last_ping_at: seedTime,
      updated_at: seedTime,
    },
    {
      id: 'amb_usb_02',
      code: 'USB-02',
      plate: 'BRA-1902',
      type: 'USB',
      status: 'available',
      current_driver_id: null,
      current_driver_name: null,
      current_lat: -9.3910,
      current_lng: -40.5180,
      current_heading: 180,
      speed: 0,
      last_ping_at: seedTime,
      updated_at: seedTime,
    },
    {
      id: 'amb_moto_01',
      code: 'MOTO-01',
      plate: 'MOT-1903',
      type: 'MOTOLANCIA',
      status: 'available',
      current_driver_id: null,
      current_driver_name: null,
      current_lat: -9.4005,
      current_lng: -40.4950,
      current_heading: 270,
      speed: 0,
      last_ping_at: seedTime,
      updated_at: seedTime,
    },
  ];

  for (const amb of ambulancesData) {
    await upsertAmbulance(amb);
  }

  const unitsData = [
    {
      id: 'unit_upa_petrolina',
      name: 'UPAE Petrolina',
      type: 'Pronto Atendimento',
      city: 'Petrolina',
      district: 'Gercino Coelho',
      address: 'Avenida Coronel Antônio Honorato Viana, s/n',
      phone: '(87) 3866-9603',
      status: 'Aberto',
      distance_km: 1.0,
      hours: '24 horas',
      lat: -9.389668754751655,
      lng: -40.522996191633226,
      services: ['Emergencia', 'Triagem', 'Enfermagem'],
    },
    {
      id: 'unit_dom_malan',
      name: 'Hospital Dom Malan',
      type: 'Hospital',
      city: 'Petrolina',
      district: 'Centro',
      address: 'Avenida Joaquim Nabuco, s/n',
      phone: '(87) 3862-2222',
      status: 'Aberto',
      distance_km: 2.1,
      hours: '24 horas',
      lat: -9.3945738,
      lng: -40.4997125,
      services: ['Pediatria', 'Maternidade', 'Urgencia'],
    },
    {
      id: 'unit_upa_juazeiro',
      name: 'UPA Juazeiro',
      type: 'Pronto Atendimento',
      city: 'Juazeiro',
      district: 'Castelo Branco',
      address: 'Rodovia Lomanto Júnior, KM 4',
      phone: '(74) 3613-4288',
      status: 'Aberto',
      distance_km: 4.8,
      hours: '24 horas',
      lat: -9.441179482788714,
      lng: -40.493536160223634,
      services: ['Emergencia', 'Pediatria'],
    },
    {
      id: 'unit_hu_univasf',
      name: 'Policlínica HU-Univasf',
      type: 'Hospital',
      city: 'Petrolina',
      district: 'Centro',
      address: 'Avenida José de Sá Maniçoba, s/n',
      phone: '(87) 2101-6500',
      status: 'Aberto',
      distance_km: 1.5,
      hours: '24 horas',
      lat: -9.390904404674428,
      lng: -40.49777466722732,
      services: ['Traumatologia', 'Urgencia', 'Cirurgia'],
    },
    {
      id: 'unit_hmup',
      name: 'Hospital Municipal de Petrolina (HMUP)',
      type: 'Hospital',
      city: 'Petrolina',
      district: 'Vila Eduardo',
      address: 'R. Eng. Carlos Pinheiro, s/n',
      phone: '(87) 3862-2222',
      status: 'Aberto',
      distance_km: 1.8,
      hours: '24 horas',
      lat: -9.392119490684395,
      lng: -40.49771742497673,
      services: ['Emergencia', 'Traumatologia'],
    },
    {
      id: 'unit_hospital_regional_juazeiro',
      name: 'Hospital Regional de Juazeiro',
      type: 'Hospital',
      city: 'Juazeiro',
      district: 'Santo Antonio',
      address: 'Travessa do Hospital, s/n',
      phone: '(74) 3614-8350',
      status: 'Aberto',
      distance_km: 5.2,
      hours: '24 horas',
      lat: -9.4141581,
      lng: -40.5109149,
      services: ['Clinica Medica', 'Cirurgia Geral'],
    }
  ];

  for (const unit of unitsData) {
    await upsertUnit(unit);
  }
}

async function upsertUser(user) {
  await dbRun(`
    INSERT INTO users (id, name, email, password_hash, role, avatar, provider, created_at, last_login, last_seen, cpf, phone, samu_role)
    VALUES (?, ?, ?, ?, ?, ?, 'local', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      password_hash = excluded.password_hash,
      role = excluded.role,
      avatar = excluded.avatar,
      samu_role = COALESCE(excluded.samu_role, users.samu_role),
      phone = COALESCE(excluded.phone, users.phone),
      last_login = COALESCE(excluded.last_login, users.last_login),
      last_seen = COALESCE(excluded.last_seen, users.last_seen),
      cpf = COALESCE(excluded.cpf, users.cpf)
  `, [
    user.id,
    user.name,
    user.email.toLowerCase(),
    user.password_hash,
    user.role,
    user.avatar,
    user.created_at,
    user.last_login || null,
    user.last_seen || null,
    user.cpf || null,
    user.phone || null,
    user.samu_role || 'citizen',
  ]);
}

async function upsertAmbulance(amb) {
  await dbRun(`
    INSERT INTO ambulances (id, code, plate, type, status, current_driver_id, current_driver_name, current_lat, current_lng, current_heading, speed, last_ping_at, updated_at, phone, driver_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      plate = excluded.plate,
      type = excluded.type,
      status = excluded.status,
      current_driver_id = excluded.current_driver_id,
      current_driver_name = excluded.current_driver_name,
      current_lat = excluded.current_lat,
      current_lng = excluded.current_lng,
      current_heading = excluded.current_heading,
      speed = excluded.speed,
      last_ping_at = excluded.last_ping_at,
      updated_at = excluded.updated_at,
      phone = COALESCE(excluded.phone, phone),
      driver_name = COALESCE(excluded.driver_name, excluded.current_driver_name, driver_name)
  `, [
    amb.id,
    amb.code,
    amb.plate,
    amb.type,
    amb.status,
    amb.current_driver_id,
    amb.current_driver_name,
    amb.current_lat,
    amb.current_lng,
    amb.current_heading,
    amb.speed,
    amb.last_ping_at,
    amb.updated_at,
    amb.phone || null,
    amb.driver_name || amb.current_driver_name || null,
  ]);
}

async function upsertUnit(unit) {
  await dbRun(`
    INSERT INTO units (id, name, type, city, district, address, phone, status, services, distance_km, hours, lat, lng, total_beds, available_beds, specialties, created_at)
    VALUES (:id, :name, :type, :city, :district, :address, :phone, :status, :services, :distance_km, :hours, :lat, :lng, :total_beds, :available_beds, :specialties, :created_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      city = excluded.city,
      district = excluded.district,
      address = excluded.address,
      phone = excluded.phone,
      status = excluded.status,
      services = excluded.services,
      distance_km = excluded.distance_km,
      hours = excluded.hours,
      lat = excluded.lat,
      lng = excluded.lng,
      total_beds = excluded.total_beds,
      available_beds = excluded.available_beds,
      specialties = excluded.specialties
  `, {
    ...unit,
    services: JSON.stringify(unit.services),
    specialties: JSON.stringify(unit.specialties || unit.services || []),
    total_beds: unit.total_beds ?? 20,
    available_beds: unit.available_beds ?? 5,
    created_at: now(),
  });
}

export async function upsertProfile(profile) {
  await dbRun(`
    INSERT INTO patient_profiles (user_id, cpf, birth_date, phone, sus_card, address, emergency_contact, updated_at)
    VALUES (:user_id, :cpf, :birth_date, :phone, :sus_card, :address, :emergency_contact, :updated_at)
    ON CONFLICT(user_id) DO UPDATE SET
      cpf = excluded.cpf,
      birth_date = excluded.birth_date,
      phone = excluded.phone,
      sus_card = excluded.sus_card,
      address = excluded.address,
      emergency_contact = excluded.emergency_contact,
      updated_at = excluded.updated_at
  `, profile);
}

export async function logAudit(actorId, action, entity, entityId) {
  await dbRun(`
    INSERT INTO audit_logs (id, actor_id, action, entity, entity_id, created_at)
    VALUES (:id, :actor_id, :action, :entity, :entity_id, :created_at)
  `, {
    id: crypto.randomUUID(),
    actor_id: actorId,
    action,
    entity,
    entity_id: entityId,
    created_at: now(),
  });
}
