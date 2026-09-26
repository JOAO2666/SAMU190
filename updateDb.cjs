const fs = require('fs');
const file = 'server/db.js';
let content = fs.readFileSync(file, 'utf8');
const idx = content.indexOf('function seedDb() {');
const before = content.substring(0, idx);
const newSeed = `function seedDb() {
  const seedTime = now();
  upsertUser({
    id: 'usr_admin_old',
    name: 'Administrador',
    email: 'admin@saudeconnect.com',
    password_hash: bcrypt.hashSync('Admin@12345', 12),
    role: 'admin',
    avatar: 'AS',
    created_at: seedTime,
    last_login: seedTime,
    last_seen: seedTime,
  });

  upsertUser({
    id: 'usr_paciente_old',
    name: 'Paciente',
    email: 'paciente@saudeconnect.com',
    password_hash: bcrypt.hashSync('Paciente@12345', 12),
    role: 'user',
    avatar: 'PA',
    created_at: seedTime,
    last_login: seedTime,
    last_seen: seedTime,
  });

  [
    {
      id: 'unit_upa_petrolina',
      name: 'UPA Petrolina',
      type: 'Pronto Atendimento',
      city: 'Petrolina',
      district: 'Centro',
      address: 'Rua x, 123 - Centro',
      phone: '(87) 3333-1111',
      status: 'Aberto',
      distance_km: 1.0,
      hours: '24 horas',
      lat: -9.3879,
      lng: -40.5000,
      services: ['Emergencia', 'Triagem', 'Enfermagem'],
    },
    {
      id: 'unit_dom_malan',
      name: 'Hospital Dom Malan',
      type: 'Hospital',
      city: 'Petrolina',
      district: 'Centro',
      address: 'Avenida das Nacoes, s/n',
      phone: '(87) 3862-2222',
      status: 'Aberto',
      distance_km: 2.1,
      hours: '24 horas',
      lat: -9.3890,
      lng: -40.5030,
      services: ['Pediatria', 'Maternidade', 'Urgencia'],
    },
    {
      id: 'unit_upa_juazeiro',
      name: 'UPA Juazeiro',
      type: 'Pronto Atendimento',
      city: 'Juazeiro',
      district: 'Castelo Branco',
      address: 'Rua y, 456',
      phone: '(74) 3333-5555',
      status: 'Aberto',
      distance_km: 4.8,
      hours: '24 horas',
      lat: -9.4124,
      lng: -40.5025,
      services: ['Emergencia', 'Pediatria'],
    }
  ].forEach(upsertUnit);
}

function seedOnce(table, id, insert) {
  const exists = db.prepare(\`SELECT id FROM \${table} WHERE id = ?\`).get(id);
  if (!exists) insert();
}

function upsertUser(user) {
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(user.id);
  if (exists) {
    db.prepare(\`
      UPDATE users
      SET name = @name, email = @email, password_hash = @password_hash, role = @role, avatar = @avatar,
          last_login = COALESCE(@last_login, last_login), last_seen = COALESCE(@last_seen, last_seen), cpf = COALESCE(@cpf, cpf)
      WHERE id = @id
    \`).run({ cpf: null, ...user });
    return;
  }

  db.prepare(\`
    INSERT INTO users (id, name, email, password_hash, role, avatar, provider, created_at, last_login, last_seen, cpf)
    VALUES (@id, @name, @email, @password_hash, @role, @avatar, 'local', @created_at, @last_login, @last_seen, @cpf)
  \`).run({ cpf: null, ...user });
}

function upsertUnit(unit) {
  db.prepare(\`
    INSERT INTO units (id, name, type, city, district, address, phone, status, services, distance_km, hours, lat, lng, created_at)
    VALUES (@id, @name, @type, @city, @district, @address, @phone, @status, @services, @distance_km, @hours, @lat, @lng, @created_at)
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
      lng = excluded.lng
  \`).run({
    ...unit,
    services: JSON.stringify(unit.services),
    created_at: now(),
  });
}

function upsertProfile(profile) {
  db.prepare(\`
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
  \`).run(profile);
}

export function logAudit(actorId, action, entity, entityId) {
  db.prepare(\`
    INSERT INTO audit_logs (id, actor_id, action, entity, entity_id, created_at)
    VALUES (@id, @actor_id, @action, @entity, @entity_id, @created_at)
  \`).run({
    id: crypto.randomUUID(),
    actor_id: actorId,
    action,
    entity,
    entity_id: entityId,
    created_at: now(),
  });
}
`;
fs.writeFileSync(file, before + newSeed);
console.log('updated db.js');
