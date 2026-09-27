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

// List all hospitals / UPAs (spec §5: hospitals with bed telemetry)
router.get('/hospitals', async (_req, res) => {
  try {
    const units = await dbAll(`
      SELECT id, name, type, city, district, address, phone, lat, lng,
              distance_km, hours, services, total_beds, available_beds, specialties
      FROM units
      WHERE type IN ('Hospital', 'Pronto Atendimento', 'UPA') OR services LIKE '%Emergencia%' OR services LIKE '%Urgencia%'
      ORDER BY name ASC
    `);

    // Parse services JSON + expose spec-compliant bed telemetry
    const parsed = units.map(u => {
      const services = typeof u.services === 'string' ? JSON.parse(u.services || '[]') : (u.services || []);
      let specialties = services;
      try {
        specialties = typeof u.specialties === 'string' ? JSON.parse(u.specialties || '[]') : (u.specialties || services);
      } catch { specialties = services; }
      const total = Number(u.total_beds ?? 20);
      const avail = Number(u.available_beds ?? 5);
      return {
        ...u,
        services,
        specialties,
        total_beds: total,
        available_beds: avail,
        totalBeds: total,
        availableBeds: avail,
        emergencyBeds: avail,
      };
    });

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

// Create an emergency call (REST fallback, spec: citizen:request_call)
router.post('/calls', async (req, res) => {
  try {
    const {
      citizenId, citizen_id,
      citizenName, citizen_name,
      citizenPhone, citizen_phone, phone,
      pickupLat, pickup_lat, lat,
      pickupLng, pickup_lng, lng,
      pickupAddress, pickup_address, address,
      severityColor, severity_color, severity,
      chiefComplaint, chief_complaint, complaint,
      symptomsSummary, symptoms_summary,
      patientName, patient_name,
      patientAge, patient_age,
      patientConscious, patient_conscious, conscious, unconscious,
      patientBreathing, patient_breathing, breathing, notBreathing, not_breathing,
      chestPain, chest_pain,
    } = req.body || {};

    const finalLat = pickupLat ?? pickup_lat ?? lat;
    const finalLng = pickupLng ?? pickup_lng ?? lng;
    if (!finalLat || !finalLng) {
      return res.status(400).json({ message: 'Coordenadas GPS do local são obrigatórias.' });
    }

    const isUnconscious = unconscious !== undefined
      ? (unconscious ? 1 : 0)
      : (patientConscious !== undefined || patient_conscious !== undefined || conscious !== undefined
        ? ((patientConscious ?? patient_conscious ?? conscious) ? 0 : 1)
        : 0);
    const isNotBreathing = (notBreathing || not_breathing)
      ? 1
      : (patientBreathing !== undefined || patient_breathing !== undefined || breathing !== undefined
        ? ((patientBreathing ?? patient_breathing ?? breathing) ? 0 : 1)
        : 0);
    const hasChestPain = (chestPain ?? chest_pain) ? 1 : 0;

    const callId = `call_${crypto.randomUUID().slice(0, 12)}`;
    const timestamp = now();

    await dbRun(`
      INSERT INTO emergency_calls (
        id, citizen_id, citizen_name, citizen_phone, phone, status, severity_color,
        chief_complaint, symptoms_summary, patient_name, patient_age,
        patient_conscious, patient_breathing, unconscious, not_breathing, chest_pain,
        pickup_lat, pickup_lng, pickup_address,
        requested_at
      ) VALUES (
        :id, :citizen_id, :citizen_name, :citizen_phone, :phone, 'searching', :severity_color,
        :chief_complaint, :symptoms_summary, :patient_name, :patient_age,
        :patient_conscious, :patient_breathing, :unconscious, :not_breathing, :chest_pain,
        :pickup_lat, :pickup_lng, :pickup_address,
        :requested_at
      )
    `, {
      id: callId,
      citizen_id: citizenId ?? citizen_id ?? null,
      citizen_name: citizenName ?? citizen_name ?? 'Cidadão Solicitante',
      citizen_phone: citizenPhone ?? citizen_phone ?? phone ?? null,
      phone: citizenPhone ?? citizen_phone ?? phone ?? null,
      severity_color: severityColor ?? severity_color ?? severity ?? 'Vermelho',
      chief_complaint: chiefComplaint ?? chief_complaint ?? complaint ?? 'Emergência Médica',
      symptoms_summary: symptomsSummary ?? symptoms_summary ?? null,
      patient_name: patientName ?? patient_name ?? citizenName ?? citizen_name ?? 'Vítima',
      patient_age: patientAge ?? patient_age ?? null,
      patient_conscious: isUnconscious ? 0 : 1,
      patient_breathing: isNotBreathing ? 0 : 1,
      unconscious: isUnconscious,
      not_breathing: isNotBreathing,
      chest_pain: hasChestPain,
      pickup_lat: finalLat,
      pickup_lng: finalLng,
      pickup_address: pickupAddress ?? pickup_address ?? address ?? 'Local da Emergência',
      requested_at: timestamp,
    });

    const call = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [callId]);
    return res.status(201).json(call);
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao registrar chamado.', error: error.message });
  }
});

// Cancel an emergency call (REST fallback for citizen:cancel_call)
router.patch('/calls/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, cancellation_reason } = req.body || {};
    const call = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [id]);
    if (!call) return res.status(404).json({ message: 'Chamado não encontrado.' });
    if (['completed', 'cancelled'].includes(call.status)) return res.json(call);
    const timestamp = now();
    await dbRun(`UPDATE emergency_calls SET status = 'cancelled', cancellation_reason = :reason WHERE id = :id`, {
      id,
      reason: reason || cancellation_reason || 'Cancelado pelo solicitante',
    });
    if (call.ambulance_id) {
      await dbRun("UPDATE ambulances SET status = 'available', updated_at = ? WHERE id = ?", [timestamp, call.ambulance_id]);
    }
    const updated = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [id]);
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao cancelar chamado.', error: error.message });
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
