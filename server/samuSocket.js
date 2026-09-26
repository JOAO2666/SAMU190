import { Server } from 'socket.io';
import crypto from 'node:crypto';
import { dbGet, dbAll, dbRun } from './db.js';

const now = () => new Date().toISOString();

// Haversine distance in kilometers
export function haversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

// Active timeouts for driver acceptance (20s)
const dispatchTimers = new Map();

export function setupSamuSocket(httpServer, corsOptions) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Conectado: ${socket.id}`);

    // Join room for citizen
    socket.on('citizen:join', ({ userId }) => {
      if (userId) {
        socket.join(`citizen:${userId}`);
        console.log(`[Socket] Cidadão na sala: citizen:${userId}`);
      }
    });

    // Join room for driver/paramedic
    socket.on('driver:join', async ({ driverId, ambulanceId }) => {
      if (driverId) {
        socket.join(`driver:${driverId}`);
        socket.data.driverId = driverId;
        console.log(`[Socket] Socorrista na sala: driver:${driverId}`);
      }
      if (ambulanceId) {
        socket.join(`ambulance:${ambulanceId}`);
        socket.data.ambulanceId = ambulanceId;
      }
    });

    // Join central dispatch room
    socket.on('central:join', () => {
      socket.join('dispatch_central');
      console.log(`[Socket] Operador na sala dispatch_central`);
    });

    // Join specific incident room (for live ride tracking & chat)
    socket.on('incident:join', ({ callId }) => {
      if (callId) {
        socket.join(`incident:${callId}`);
        console.log(`[Socket] Inscrito na ocorrência: incident:${callId}`);
      }
    });

    // Driver toggles shift or registers online
    socket.on('driver:toggle_shift', async (data) => {
      try {
        const { driverId, driverName, ambulanceId, status, lat, lng } = data;
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

        const updated = await dbGet('SELECT * FROM ambulances WHERE id = ?', [ambulanceId]);
        io.to('dispatch_central').emit('ambulance:updated', updated);
        socket.emit('driver:shift_updated', updated);
      } catch (err) {
        console.error('[Socket] Erro ao alternar plantão:', err);
      }
    });

    // Continuous location telemetry ping from driver
    socket.on('driver:telemetry_ping', async (data) => {
      try {
        const { ambulanceId, callId, lat, lng, speed, heading } = data;
        if (!ambulanceId || !lat || !lng) return;

        await dbRun(`
          UPDATE ambulances
          SET current_lat = :lat, current_lng = :lng, current_heading = :heading,
              speed = :speed, last_ping_at = :last_ping_at, updated_at = :updated_at
          WHERE id = :id
        `, {
          id: ambulanceId,
          lat,
          lng,
          heading: heading || 0,
          speed: speed || 0,
          last_ping_at: now(),
          updated_at: now(),
        });

        if (callId) {
          await dbRun(`
            INSERT INTO telemetry_logs (emergency_call_id, ambulance_id, lat, lng, speed, heading, recorded_at)
            VALUES (:emergency_call_id, :ambulance_id, :lat, :lng, :speed, :heading, :recorded_at)
          `, {
            emergency_call_id: callId,
            ambulance_id: ambulanceId,
            lat,
            lng,
            speed: speed || 0,
            heading: heading || 0,
            recorded_at: now(),
          });

          // Broadcast to requester and everyone tracking this ride
          io.to(`incident:${callId}`).emit('ambulance:telemetry', {
            ambulanceId,
            callId,
            lat,
            lng,
            speed,
            heading,
            timestamp: now(),
          });
        }

        // Always update central dispatch
        io.to('dispatch_central').emit('ambulance:telemetry', {
          ambulanceId,
          callId,
          lat,
          lng,
          speed,
          heading,
          timestamp: now(),
        });
      } catch (err) {
        console.error('[Socket] Erro no telemetry_ping:', err);
      }
    });

    // Citizen creates an emergency call
    socket.on('citizen:request_emergency', async (data) => {
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
        } = data;

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

        const createdCall = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [callId]);
        socket.join(`incident:${callId}`);
        socket.emit('call:created', createdCall);
        io.to('dispatch_central').emit('call:new', createdCall);

        // Attempt automatic dispatch
        await matchAndDispatchCall(io, callId);
      } catch (err) {
        console.error('[Socket] Erro ao criar emergência:', err);
        socket.emit('call:error', { message: 'Falha ao processar solicitação de emergência.' });
      }
    });

    // Driver accepts call
    socket.on('driver:accept_call', async ({ callId, driverId, ambulanceId }) => {
      try {
        if (dispatchTimers.has(callId)) {
          clearTimeout(dispatchTimers.get(callId));
          dispatchTimers.delete(callId);
        }

        const amb = await dbGet('SELECT * FROM ambulances WHERE id = ?', [ambulanceId]);
        const call = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [callId]);
        if (!call) return;

        const distance = haversineDistance(
          amb?.current_lat || 0,
          amb?.current_lng || 0,
          call.pickup_lat,
          call.pickup_lng
        );
        const etaMinutes = Math.max(1, Math.round((distance / 45) * 60)); // Avg 45km/h with siren

        await dbRun(`
          UPDATE emergency_calls
          SET status = 'en_route_pickup',
              ambulance_id = :ambulance_id,
              driver_id = :driver_id,
              driver_name = :driver_name,
              distance_km = :distance_km,
              eta_minutes = :eta_minutes,
              accepted_at = :accepted_at
          WHERE id = :id
        `, {
          id: callId,
          ambulance_id: ambulanceId,
          driver_id: driverId,
          driver_name: amb?.current_driver_name || 'Socorrista SAMU',
          distance_km: distance,
          eta_minutes: etaMinutes,
          accepted_at: now(),
        });

        await dbRun(`
          UPDATE ambulances
          SET status = 'busy', updated_at = :updated_at
          WHERE id = :id
        `, { id: ambulanceId, updated_at: now() });

        const updatedCall = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [callId]);
        const updatedAmb = await dbGet('SELECT * FROM ambulances WHERE id = ?', [ambulanceId]);

        socket.join(`incident:${callId}`);
        io.to(`incident:${callId}`).emit('call:accepted', { call: updatedCall, ambulance: updatedAmb });
        io.to(`citizen:${call.citizen_id}`).emit('call:accepted', { call: updatedCall, ambulance: updatedAmb });
        io.to('dispatch_central').emit('call:updated', updatedCall);
        io.to('dispatch_central').emit('ambulance:updated', updatedAmb);
      } catch (err) {
        console.error('[Socket] Erro ao aceitar chamado:', err);
      }
    });

    // Driver rejects call
    socket.on('driver:reject_call', async ({ callId, ambulanceId }) => {
      try {
        if (dispatchTimers.has(callId)) {
          clearTimeout(dispatchTimers.get(callId));
          dispatchTimers.delete(callId);
        }

        // Set ambulance back to available
        if (ambulanceId) {
          await dbRun("UPDATE ambulances SET status = 'available', updated_at = ? WHERE id = ?", [now(), ambulanceId]);
          const amb = await dbGet('SELECT * FROM ambulances WHERE id = ?', [ambulanceId]);
          io.to('dispatch_central').emit('ambulance:updated', amb);
        }

        // Re-dispatch call to other available ambulances
        await dbRun("UPDATE emergency_calls SET status = 'searching' WHERE id = ?", [callId]);
        await matchAndDispatchCall(io, callId, [ambulanceId]);
      } catch (err) {
        console.error('[Socket] Erro ao rejeitar chamado:', err);
      }
    });

    // Driver advances state
    socket.on('driver:advance_status', async (data) => {
      try {
        const { callId, nextStatus, targetHospitalId, targetHospitalName, cancellationReason } = data;
        const call = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [callId]);
        if (!call) return;

        const updates = { status: nextStatus };
        const timestamp = now();

        if (nextStatus === 'arrived_scene') {
          updates.arrived_scene_at = timestamp;
        } else if (nextStatus === 'transporting') {
          updates.left_scene_at = timestamp;
          if (targetHospitalId) {
            updates.target_hospital_id = targetHospitalId;
            updates.target_hospital_name = targetHospitalName;
          }
        } else if (nextStatus === 'arrived_hospital') {
          updates.arrived_hospital_at = timestamp;
        } else if (nextStatus === 'completed') {
          updates.completed_at = timestamp;
          // Free ambulance
          if (call.ambulance_id) {
            await dbRun("UPDATE ambulances SET status = 'available', updated_at = ? WHERE id = ?", [timestamp, call.ambulance_id]);
            const freedAmb = await dbGet('SELECT * FROM ambulances WHERE id = ?', [call.ambulance_id]);
            io.to('dispatch_central').emit('ambulance:updated', freedAmb);
          }
        } else if (nextStatus === 'cancelled') {
          updates.cancellation_reason = cancellationReason || 'Cancelado pelo operador/equipe';
          if (call.ambulance_id) {
            await dbRun("UPDATE ambulances SET status = 'available', updated_at = ? WHERE id = ?", [timestamp, call.ambulance_id]);
          }
        }

        // Build dynamic SQL
        const setClauses = Object.keys(updates).map(k => `${k} = :${k}`).join(', ');
        await dbRun(`UPDATE emergency_calls SET ${setClauses} WHERE id = :id`, { id: callId, ...updates });

        const updatedCall = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [callId]);
        io.to(`incident:${callId}`).emit('call:status_changed', updatedCall);
        io.to('dispatch_central').emit('call:updated', updatedCall);
      } catch (err) {
        console.error('[Socket] Erro ao avançar status:', err);
      }
    });

    // Chat in incident room
    socket.on('incident:send_message', async (data) => {
      try {
        const { callId, senderId, senderName, senderRole, message } = data;
        const msgId = `msg_${crypto.randomUUID().slice(0, 10)}`;
        const timestamp = now();

        await dbRun(`
          INSERT INTO emergency_messages (id, emergency_call_id, sender_id, sender_name, sender_role, message, created_at)
          VALUES (:id, :emergency_call_id, :sender_id, :sender_name, :sender_role, :message, :created_at)
        `, {
          id: msgId,
          emergency_call_id: callId,
          sender_id: senderId,
          sender_name: senderName || 'Usuário',
          sender_role: senderRole || 'citizen',
          message,
          created_at: timestamp,
        });

        const createdMsg = {
          id: msgId,
          emergency_call_id: callId,
          sender_id: senderId,
          sender_name: senderName,
          sender_role: senderRole,
          message,
          created_at: timestamp,
        };

        io.to(`incident:${callId}`).emit('incident:new_message', createdMsg);
      } catch (err) {
        console.error('[Socket] Erro ao enviar mensagem:', err);
      }
    });

    // Save BAPH (Boletim de Atendimento Pré-Hospitalar)
    socket.on('driver:save_baph', async (data) => {
      try {
        const {
          callId,
          glasgowScore,
          systolicBp,
          diastolicBp,
          heartRate,
          oxygenSaturation,
          respiratoryRate,
          proceduresPerformed,
          observations,
        } = data;

        const baphId = `baph_${crypto.randomUUID().slice(0, 10)}`;
        const timestamp = now();

        await dbRun(`
          INSERT INTO baph_records (
            id, emergency_call_id, glasgow_score, systolic_bp, diastolic_bp,
            heart_rate, oxygen_saturation, respiratory_rate, procedures_performed,
            observations, created_at
          ) VALUES (
            :id, :emergency_call_id, :glasgow_score, :systolic_bp, :diastolic_bp,
            :heart_rate, :oxygen_saturation, :respiratory_rate, :procedures_performed,
            :observations, :created_at
          )
          ON CONFLICT(emergency_call_id) DO UPDATE SET
            glasgow_score = excluded.glasgow_score,
            systolic_bp = excluded.systolic_bp,
            diastolic_bp = excluded.diastolic_bp,
            heart_rate = excluded.heart_rate,
            oxygen_saturation = excluded.oxygen_saturation,
            respiratory_rate = excluded.respiratory_rate,
            procedures_performed = excluded.procedures_performed,
            observations = excluded.observations,
            created_at = excluded.created_at
        `, {
          id: baphId,
          emergency_call_id: callId,
          glasgow_score: glasgowScore || null,
          systolic_bp: systolicBp || null,
          diastolic_bp: diastolicBp || null,
          heart_rate: heartRate || null,
          oxygen_saturation: oxygenSaturation || null,
          respiratory_rate: respiratoryRate || null,
          procedures_performed: Array.isArray(proceduresPerformed) ? JSON.stringify(proceduresPerformed) : (proceduresPerformed || null),
          observations: observations || null,
          created_at: timestamp,
        });

        const savedBaph = await dbGet('SELECT * FROM baph_records WHERE emergency_call_id = ?', [callId]);
        io.to(`incident:${callId}`).emit('baph:updated', savedBaph);
        io.to('dispatch_central').emit('baph:updated', savedBaph);
        socket.emit('baph:saved', savedBaph);
      } catch (err) {
        console.error('[Socket] Erro ao salvar BAPH:', err);
      }
    });

    // Central regulator manual dispatch override
    socket.on('central:manual_dispatch', async ({ callId, ambulanceId }) => {
      try {
        const amb = await dbGet('SELECT * FROM ambulances WHERE id = ?', [ambulanceId]);
        const call = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [callId]);
        if (!amb || !call) return;

        const distance = haversineDistance(
          amb.current_lat || 0,
          amb.current_lng || 0,
          call.pickup_lat,
          call.pickup_lng
        );
        const etaMinutes = Math.max(1, Math.round((distance / 45) * 60));

        await dbRun(`
          UPDATE emergency_calls
          SET status = 'en_route_pickup',
              ambulance_id = :ambulance_id,
              driver_id = :driver_id,
              driver_name = :driver_name,
              distance_km = :distance_km,
              eta_minutes = :eta_minutes,
              accepted_at = :accepted_at
          WHERE id = :id
        `, {
          id: callId,
          ambulance_id: ambulanceId,
          driver_id: amb.current_driver_id || null,
          driver_name: amb.current_driver_name || 'Equipe SAMU',
          distance_km: distance,
          eta_minutes: etaMinutes,
          accepted_at: now(),
        });

        await dbRun("UPDATE ambulances SET status = 'busy', updated_at = ? WHERE id = ?", [now(), ambulanceId]);

        const updatedCall = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [callId]);
        const updatedAmb = await dbGet('SELECT * FROM ambulances WHERE id = ?', [ambulanceId]);

        io.to(`incident:${callId}`).emit('call:accepted', { call: updatedCall, ambulance: updatedAmb });
        if (amb.current_driver_id) {
          io.to(`driver:${amb.current_driver_id}`).emit('driver:force_dispatch', { call: updatedCall, ambulance: updatedAmb });
        }
        io.to('dispatch_central').emit('call:updated', updatedCall);
        io.to('dispatch_central').emit('ambulance:updated', updatedAmb);
      } catch (err) {
        console.error('[Socket] Erro no manual_dispatch:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Desconectado: ${socket.id}`);
    });
  });

  return io;
}

// Automatic spatial matching and 20s dispatch countdown
export async function matchAndDispatchCall(io, callId, excludedAmbulanceIds = []) {
  try {
    const call = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [callId]);
    if (!call || call.status !== 'searching') return;

    let ambulances = await dbAll("SELECT * FROM ambulances WHERE status = 'available'");
    if (excludedAmbulanceIds.length > 0) {
      ambulances = ambulances.filter(a => !excludedAmbulanceIds.includes(a.id));
    }

    if (ambulances.length === 0) {
      console.log(`[Dispatch] Nenhuma viatura disponível no momento para chamado ${callId}`);
      io.to(`incident:${callId}`).emit('call:queue_waiting', {
        message: 'Todas as viaturas estão ocupadas. Sua ocorrência está no topo da fila de regulação.',
      });
      return;
    }

    // Sort by suitability according to Manchester severity & distance
    const candidates = ambulances.map((amb) => {
      const dist = haversineDistance(
        amb.current_lat || 0,
        amb.current_lng || 0,
        call.pickup_lat,
        call.pickup_lng
      );

      let suitabilityScore = dist;
      // High severity prefers USA (UTI Móvel)
      if (['Vermelho', 'Laranja'].includes(call.severity_color)) {
        if (amb.type === 'USA') suitabilityScore -= 5;
        if (amb.type === 'MOTOLANCIA') suitabilityScore += 3;
      } else {
        // Lower severity prefers USB or Motolância
        if (amb.type === 'USB' || amb.type === 'MOTOLANCIA') suitabilityScore -= 3;
      }

      return { ambulance: amb, distance: dist, score: suitabilityScore };
    });

    candidates.sort((a, b) => a.score - b.score);
    const chosen = candidates[0].ambulance;
    const distanceKm = candidates[0].distance;
    const etaMinutes = Math.max(1, Math.round((distanceKm / 45) * 60));

    // Update status to 'offered'
    await dbRun(`
      UPDATE emergency_calls
      SET status = 'offered', ambulance_id = :ambulance_id, distance_km = :distance_km, eta_minutes = :eta_minutes
      WHERE id = :id
    `, {
      id: callId,
      ambulance_id: chosen.id,
      distance_km: distanceKm,
      eta_minutes: etaMinutes,
    });

    const offerPayload = {
      callId,
      severityColor: call.severity_color,
      chiefComplaint: call.chief_complaint,
      symptomsSummary: call.symptoms_summary,
      patientName: call.patient_name,
      patientAge: call.patient_age,
      patientConscious: call.patient_conscious,
      patientBreathing: call.patient_breathing,
      pickupAddress: call.pickup_address,
      pickupLat: call.pickup_lat,
      pickupLng: call.pickup_lng,
      distanceKm,
      etaMinutes,
      timeoutSeconds: 20,
    };

    // Emit offer to driver's private room
    if (chosen.current_driver_id) {
      io.to(`driver:${chosen.current_driver_id}`).emit('driver:dispatch_offer', offerPayload);
    }
    // Also emit to ambulance room and central
    io.to(`ambulance:${chosen.id}`).emit('driver:dispatch_offer', offerPayload);
    io.to('dispatch_central').emit('call:offered', { callId, ambulance: chosen, distanceKm });

    // Set 20 seconds timeout to auto-reject if driver doesn't answer
    const timer = setTimeout(async () => {
      try {
        const freshCall = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [callId]);
        if (freshCall && freshCall.status === 'offered') {
          console.log(`[Dispatch] Timeout de 20s atingido para viatura ${chosen.code}. Redespachando...`);
          await dbRun("UPDATE emergency_calls SET status = 'searching', ambulance_id = NULL WHERE id = ?", [callId]);
          await matchAndDispatchCall(io, callId, [...excludedAmbulanceIds, chosen.id]);
        }
      } catch (e) {
        console.error('[Dispatch] Erro no timeout handler:', e);
      }
    }, 20000);

    dispatchTimers.set(callId, timer);
  } catch (err) {
    console.error('[Dispatch] Erro no matchAndDispatchCall:', err);
  }
}
