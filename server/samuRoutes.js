import express from 'express';
import crypto from 'node:crypto';
import { dbGet, dbAll, dbRun } from './db.js';
import { authRequired } from './auth.js';

const router = express.Router();
const now = () => new Date().toISOString();

// List all ambulances
router.get('/ambulances', async (_req, res) => {
  try {
    const ambulances = await dbAll('SELECT * FROM ambulances ORDER BY code ASC');
    return res.json(ambulances);
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao listar viaturas.', error: error.message });
  }
});

// List all hospitals / UPAs
router.get('/hospitals', async (_req, res) => {
  try {
    const units = await dbAll(`
      SELECT id, name, type, city, district, address, phone, lat, lng,
             distance_km, hours, services
      FROM units
      WHERE type IN ('Hospital', 'Pronto Atendimento', 'UPA') OR services LIKE '%Emergencia%' OR services LIKE '%Urgencia%'
      ORDER BY name ASC
    `);

    // Parse services JSON
    const parsed = units.map(u => ({
      ...u,
      services: typeof u.services === 'string' ? JSON.parse(u.services || '[]') : u.services,
      emergencyBeds: 5,
    }));

    return res.json(parsed);
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao listar hospitais.', error: error.message });
  }
});

// List active emergency calls (for central and drivers)
router.get('/calls/active', async (_req, res) => {
  try {
    const calls = await dbAll(`
      SELECT c.*, a.code as ambulance_code, a.type as ambulance_type, a.plate as ambulance_plate,
             a.current_lat as ambulance_lat, a.current_lng as ambulance_lng
      FROM emergency_calls c
      LEFT JOIN ambulances a ON c.ambulance_id = a.id
      WHERE c.status NOT IN ('completed', 'cancelled')
      ORDER BY
        CASE c.severity_color
          WHEN 'Vermelho' THEN 1
          WHEN 'Laranja' THEN 2
          WHEN 'Amarelo' THEN 3
          WHEN 'Verde' THEN 4
          ELSE 5
        END ASC,
        c.requested_at DESC
    `);
    return res.json(calls);
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao buscar chamados ativos.', error: error.message });
  }
});

// Get active call for current user (Citizen or Driver)
router.get('/calls/my-active', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    let call = null;

    if (req.user.samu_role === 'driver') {
      call = await dbGet(`
        SELECT c.*, a.code as ambulance_code, a.plate as ambulance_plate, a.type as ambulance_type,
               a.current_lat as ambulance_lat, a.current_lng as ambulance_lng
        FROM emergency_calls c
        LEFT JOIN ambulances a ON c.ambulance_id = a.id
        WHERE c.driver_id = ? AND c.status NOT IN ('completed', 'cancelled')
        ORDER BY c.requested_at DESC LIMIT 1
      `, [userId]);
    } else {
      call = await dbGet(`
        SELECT c.*, a.code as ambulance_code, a.plate as ambulance_plate, a.type as ambulance_type,
               a.current_lat as ambulance_lat, a.current_lng as ambulance_lng
        FROM emergency_calls c
        LEFT JOIN ambulances a ON c.ambulance_id = a.id
        WHERE c.citizen_id = ? AND c.status NOT IN ('completed', 'cancelled')
        ORDER BY c.requested_at DESC LIMIT 1
      `, [userId]);
    }

    if (!call) return res.json(null);

    // Fetch messages & baph if exists
    const messages = await dbAll('SELECT * FROM emergency_messages WHERE emergency_call_id = ? ORDER BY created_at ASC', [call.id]);
    const baph = await dbGet('SELECT * FROM baph_records WHERE emergency_call_id = ?', [call.id]);

    return res.json({
      ...call,
      messages: messages || [],
      baph: baph || null,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao buscar chamada ativa.', error: error.message });
  }
});

// Get specific emergency call details
router.get('/calls/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const call = await dbGet(`
      SELECT c.*, a.code as ambulance_code, a.plate as ambulance_plate, a.type as ambulance_type,
             a.current_lat as ambulance_lat, a.current_lng as ambulance_lng, a.current_heading as ambulance_heading
      FROM emergency_calls c
      LEFT JOIN ambulances a ON c.ambulance_id = a.id
      WHERE c.id = ?
    `, [id]);

    if (!call) {
      return res.status(404).json({ message: 'Chamado de emergência não encontrado.' });
    }

    const messages = await dbAll('SELECT * FROM emergency_messages WHERE emergency_call_id = ? ORDER BY created_at ASC', [id]);
    const baph = await dbGet('SELECT * FROM baph_records WHERE emergency_call_id = ?', [id]);
    const telemetry = await dbAll('SELECT lat, lng, speed, heading, recorded_at FROM telemetry_logs WHERE emergency_call_id = ? ORDER BY id ASC LIMIT 50', [id]);

    return res.json({
      ...call,
      messages: messages || [],
      baph: baph || null,
      telemetry: telemetry || [],
    });
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao buscar detalhes da ocorrência.', error: error.message });
  }
});

// Create an emergency call (REST fallback)
router.post('/calls', async (req, res) => {
  try {
    const {
      citizenId,
      citizenName,
      citizenPhone,
      pickupLat,
      pickupLng,
      pickupAddress,
      severityColor,
      chiefComplaint,
      symptomsSummary,
      patientName,
      patientAge,
      patientConscious,
      patientBreathing,
    } = req.body;

    const callId = `call_${crypto.randomUUID().slice(0, 12)}`;
    const timestamp = now();

    await dbRun(`
      INSERT INTO emergency_calls (
        id, citizen_id, citizen_name, citizen_phone, status, severity_color,
        chief_complaint, symptoms_summary, patient_name, patient_age,
        patient_conscious, patient_breathing, pickup_lat, pickup_lng, pickup_address,
        requested_at
      ) VALUES (
        :id, :citizen_id, :citizen_name, :citizen_phone, 'searching', :severity_color,
        :chief_complaint, :symptoms_summary, :patient_name, :patient_age,
        :patient_conscious, :patient_breathing, :pickup_lat, :pickup_lng, :pickup_address,
        :requested_at
      )
    `, {
      id: callId,
      citizen_id: citizenId || null,
      citizen_name: citizenName || 'Cidadão Solicitante',
      citizen_phone: citizenPhone || null,
      severity_color: severityColor || 'Vermelho',
      chief_complaint: chiefComplaint || 'Emergência Médica',
      symptoms_summary: symptomsSummary || null,
      patient_name: patientName || citizenName || 'Vítima',
      patient_age: patientAge || null,
      patient_conscious: patientConscious !== undefined ? (patientConscious ? 1 : 0) : 1,
      patient_breathing: patientBreathing !== undefined ? (patientBreathing ? 1 : 0) : 1,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      pickup_address: pickupAddress || 'Local da Emergência',
      requested_at: timestamp,
    });

    const call = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [callId]);
    return res.status(201).json(call);
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao registrar chamado.', error: error.message });
  }
});

// Update driver shift status
router.post('/driver/shift', authRequired, async (req, res) => {
  try {
    const { ambulanceId, status, lat, lng } = req.body;
    const driverId = req.user.id;
    const driverName = req.user.name;

    await dbRun(`
      UPDATE ambulances
      SET status = :status,
          current_driver_id = :current_driver_id,
          current_driver_name = :current_driver_name,
          current_lat = COALESCE(:lat, current_lat),
          current_lng = COALESCE(:lng, current_lng),
          last_ping_at = :last_ping_at,
          updated_at = :updated_at
      WHERE id = :id
    `, {
      id: ambulanceId,
      status: status || 'available',
      current_driver_id: status === 'offline' ? null : driverId,
      current_driver_name: status === 'offline' ? null : driverName,
      lat: lat || null,
      lng: lng || null,
      last_ping_at: now(),
      updated_at: now(),
    });

    const amb = await dbGet('SELECT * FROM ambulances WHERE id = ?', [ambulanceId]);
    return res.json(amb);
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao alternar plantão.', error: error.message });
  }
});

export default router;
