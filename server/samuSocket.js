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
    // Spec alias: `ambulance:telemetry` (emit) / accepts `driver:telemetry_ping`
    async function handleTelemetryPing(data) {
      try {
        const { ambulanceId, ambulance_id, callId, call_id, lat, lng, speed, heading } = data || {};
        const ambId = ambulanceId || ambulance_id;
        const cId = callId || call_id || null;
        if (!ambId || !lat || !lng) return;

        await dbRun(`
          UPDATE ambulances
          SET current_lat = :lat, current_lng = :lng, current_heading = :heading,
              speed = :speed, last_ping_at = :last_ping_at, updated_at = :updated_at
          WHERE id = :id
        `, {
          id: ambId,
          lat,
          lng,
          heading: heading || 0,
          speed: speed || 0,
          last_ping_at: now(),
          updated_at: now(),
        });

        if (cId) {
          await dbRun(`
            INSERT INTO telemetry_logs (emergency_call_id, call_id, ambulance_id, lat, lng, speed, heading, recorded_at, timestamp)
            VALUES (:emergency_call_id, :call_id, :ambulance_id, :lat, :lng, :speed, :heading, :recorded_at, :timestamp)
          `, {
            emergency_call_id: cId,
            call_id: cId,
            ambulance_id: ambId,
            lat,
            lng,
            speed: speed || 0,
            heading: heading || 0,
            recorded_at: now(),
            timestamp: now(),
          });

          // Broadcast to requester and everyone tracking this ride
          io.to(`incident:${cId}`).emit('ambulance:telemetry', {
            ambulanceId: ambId,
            callId: cId,
            lat,
            lng,
            speed,
            heading,
            timestamp: now(),
          });
        }

        // Always update central dispatch
        io.to('dispatch_central').emit('ambulance:telemetry', {
          ambulanceId: ambId,
          callId: cId,
          lat,
          lng,
          speed,
          heading,
          timestamp: now(),
        });
      } catch (err) {
        console.error('[Socket] Erro no telemetry_ping:', err);
      }
    }

    socket.on('driver:telemetry_ping', handleTelemetryPing);
    // Spec-compliant alias: client may emit ambulance:telemetry directly
    socket.on('ambulance:telemetry', handleTelemetryPing);

    // Citizen creates an emergency call
    // Spec event: `citizen:request_call` (alias legado: `citizen:request_emergency`)
    async function handleCitizenRequest(data) {
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
          chestPain, chest_pain, chestPainFlag,
        } = data || {};

        const finalLat = pickupLat ?? pickup_lat ?? lat;
        const finalLng = pickupLng ?? pickup_lng ?? lng;
        if (!finalLat || !finalLng) {
          socket.emit('call:error', { message: 'Coordenadas GPS do local são obrigatórias.' });
          return;
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
        const hasChestPain = (chestPain ?? chest_pain ?? chestPainFlag) ? 1 : 0;
        const finalSeverity = severityColor || severity_color || severity || 'Vermelho';

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
          citizen_id: citizenId || citizen_id || null,
          citizen_name: citizenName || citizen_name || 'Cidadão Solicitante',
          citizen_phone: citizenPhone || citizen_phone || phone || null,
          phone: citizenPhone || citizen_phone || phone || null,
          severity_color: finalSeverity,
          chief_complaint: chiefComplaint || chief_complaint || complaint || 'Emergência Médica',
          symptoms_summary: symptomsSummary || symptoms_summary || null,
          patient_name: patientName || patient_name || citizenName || citizen_name || 'Vítima',
          patient_age: patientAge ?? patient_age ?? null,
          patient_conscious: isUnconscious ? 0 : 1,
          patient_breathing: isNotBreathing ? 0 : 1,
          unconscious: isUnconscious,
          not_breathing: isNotBreathing,
          chest_pain: hasChestPain,
          pickup_lat: finalLat,
          pickup_lng: finalLng,
          pickup_address: pickupAddress || pickup_address || address || 'Local da Emergência',
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
    }

    socket.on('citizen:request_emergency', handleCitizenRequest);
    socket.on('citizen:request_call', handleCitizenRequest);

    // Citizen cancels an emergency call (was missing — CitizenApp already emits it)
    async function handleCitizenCancel(data) {
      try {
        const { callId, call_id, id, reason, cancellationReason } = data || {};
        const targetId = callId || call_id || id;
        if (!targetId) return;
        const call = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [targetId]);
        if (!call || ['completed', 'cancelled'].includes(call.status)) return;
        const timestamp = now();
        await dbRun(`UPDATE emergency_calls SET status = 'cancelled', cancellation_reason = :reason WHERE id = :id`, {
          id: targetId,
          reason: reason || cancellationReason || 'Cancelado pelo solicitante',
        });
        if (call.ambulance_id) {
          await dbRun("UPDATE ambulances SET status = 'available', updated_at = ? WHERE id = ?", [timestamp, call.ambulance_id]);
          const freedAmb = await dbGet('SELECT * FROM ambulances WHERE id = ?', [call.ambulance_id]);
          if (freedAmb) io.to('dispatch_central').emit('ambulance:updated', freedAmb);
        }
        if (dispatchTimers.has(targetId)) {
          clearTimeout(dispatchTimers.get(targetId));
          dispatchTimers.delete(targetId);
        }
        const updatedCall = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [targetId]);
        io.to(`incident:${targetId}`).emit('call:status_changed', updatedCall);
        io.to('dispatch_central').emit('call:updated', updatedCall);
        socket.emit('call:cancelled', updatedCall);
      } catch (err) {
        console.error('[Socket] Erro ao cancelar chamado:', err);
      }
    }

    socket.on('citizen:cancel_call', handleCitizenCancel);
    socket.on('citizen:cancel', handleCitizenCancel);
    socket.on('call:cancel', handleCitizenCancel);

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
    // Emits spec event `call:status_changed` on every transition
    socket.on('driver:advance_status', async (data) => {
      try {
        const { callId, call_id, nextStatus, status, targetHospitalId, target_hospital_id, destinationHospitalId, destination_hospital_id, targetHospitalName, target_hospital_name, destinationHospitalName, cancellationReason, cancellation_reason } = data || {};
        const targetCallId = callId || call_id;
        const finalStatus = nextStatus || status;
        const call = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [targetCallId]);
        if (!call) return;

        const updates = { status: finalStatus };
        const timestamp = now();
        const hospId = targetHospitalId || target_hospital_id || destinationHospitalId || destination_hospital_id || null;
        const hospName = targetHospitalName || target_hospital_name || destinationHospitalName || null;

        if (finalStatus === 'arrived_scene') {
          updates.arrived_scene_at = timestamp;
        } else if (finalStatus === 'transporting') {
          updates.left_scene_at = timestamp;
          if (hospId) {
            updates.target_hospital_id = hospId;
            updates.target_hospital_name = hospName;
            updates.destination_hospital_id = hospId;
          }
        } else if (finalStatus === 'arrived_hospital') {
          updates.arrived_hospital_at = timestamp;
        } else if (finalStatus === 'completed') {
          updates.completed_at = timestamp;
          // Free ambulance
          if (call.ambulance_id) {
            await dbRun("UPDATE ambulances SET status = 'available', updated_at = ? WHERE id = ?", [timestamp, call.ambulance_id]);
            const freedAmb = await dbGet('SELECT * FROM ambulances WHERE id = ?', [call.ambulance_id]);
            io.to('dispatch_central').emit('ambulance:updated', freedAmb);
          }
        } else if (finalStatus === 'cancelled') {
          updates.cancellation_reason = cancellationReason || cancellation_reason || 'Cancelado pelo operador/equipe';
          if (call.ambulance_id) {
            await dbRun("UPDATE ambulances SET status = 'available', updated_at = ? WHERE id = ?", [timestamp, call.ambulance_id]);
          }
        }

        // Build dynamic SQL
        const setClauses = Object.keys(updates).map(k => `${k} = :${k}`).join(', ');
        await dbRun(`UPDATE emergency_calls SET ${setClauses} WHERE id = :id`, { id: targetCallId, ...updates });

        const updatedCall = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [targetCallId]);
        io.to(`incident:${targetCallId}`).emit('call:status_changed', updatedCall);
        io.to('dispatch_central').emit('call:updated', updatedCall);
        // Spec alias: also emit legacy driver room update for dashboards listening on call:status_changed
        io.to('dispatch_central').emit('call:status_changed', updatedCall);
      } catch (err) {
        console.error('[Socket] Erro ao avançar status:', err);
      }
    });

    // Chat in incident room
    // Spec event: `incident:message` (alias legado: `incident:send_message` / `incident:new_message`)
    async function handleIncidentMessage(data) {
      try {
        const { callId, call_id, emergency_call_id, senderId, sender_id, senderName, sender_name, senderRole, sender_role, role, message, text } = data || {};
        const targetCallId = callId || call_id || emergency_call_id;
        const finalSenderId = senderId || sender_id || 'anonymous';
        const finalSenderName = senderName || sender_name || 'Usuário';
        const finalRole = senderRole || sender_role || role || 'citizen';
        const finalText = message ?? text ?? '';
        if (!targetCallId || !String(finalText).trim()) return;
        const msgId = `msg_${crypto.randomUUID().slice(0, 10)}`;
        const timestamp = now();

        await dbRun(`
          INSERT INTO emergency_messages (id, emergency_call_id, sender_id, sender_name, sender_role, role, message, text, created_at, timestamp)
          VALUES (:id, :emergency_call_id, :sender_id, :sender_name, :sender_role, :role, :message, :text, :created_at, :timestamp)
        `, {
          id: msgId,
          emergency_call_id: targetCallId,
          sender_id: finalSenderId,
          sender_name: finalSenderName,
          sender_role: finalRole,
          role: finalRole,
          message: finalText,
          text: finalText,
          created_at: timestamp,
          timestamp,
        });

        const createdMsg = {
          id: msgId,
          emergency_call_id: targetCallId,
          sender_id: finalSenderId,
          sender_name: finalSenderName,
          sender_role: finalRole,
          role: finalRole,
          message: finalText,
          text: finalText,
          created_at: timestamp,
          timestamp,
        };

        io.to(`incident:${targetCallId}`).emit('incident:new_message', createdMsg);
        io.to(`incident:${targetCallId}`).emit('incident:message', createdMsg);
      } catch (err) {
        console.error('[Socket] Erro ao enviar mensagem:', err);
      }
    }

    socket.on('incident:send_message', handleIncidentMessage);
    socket.on('incident:message', handleIncidentMessage);

    // Save BAPH (Boletim de Atendimento Pré-Hospitalar)
    socket.on('driver:save_baph', async (data) => {
      try {
        const {
          callId, call_id,
          glasgowScore, glasgow_score,
          systolicBp, systolic_bp,
          diastolicBp, diastolic_bp,
          heartRate, heart_rate,
          oxygenSaturation, oxygen_saturation, o2Sat, o2_sat,
          respiratoryRate, respiratory_rate,
          proceduresPerformed, procedures_performed,
          observations, notes,
          filledBy, filled_by,
        } = data || {};
        const targetCallId = callId || call_id;
        if (!targetCallId) return;

        const finalO2 = oxygenSaturation ?? oxygen_saturation ?? o2Sat ?? o2_sat ?? null;
        const finalNotes = observations ?? notes ?? null;

        const baphId = `baph_${crypto.randomUUID().slice(0, 10)}`;
        const timestamp = now();

        await dbRun(`
          INSERT INTO baph_records (
            id, emergency_call_id, glasgow_score, systolic_bp, diastolic_bp,
            heart_rate, oxygen_saturation, o2_sat, respiratory_rate, procedures_performed,
            observations, notes, filled_by, filled_at, created_at
          ) VALUES (
            :id, :emergency_call_id, :glasgow_score, :systolic_bp, :diastolic_bp,
            :heart_rate, :oxygen_saturation, :o2_sat, :respiratory_rate, :procedures_performed,
            :observations, :notes, :filled_by, :filled_at, :created_at
          )
          ON CONFLICT(emergency_call_id) DO UPDATE SET
            glasgow_score = excluded.glasgow_score,
            systolic_bp = excluded.systolic_bp,
            diastolic_bp = excluded.diastolic_bp,
            heart_rate = excluded.heart_rate,
            oxygen_saturation = excluded.oxygen_saturation,
            o2_sat = excluded.o2_sat,
            respiratory_rate = excluded.respiratory_rate,
            procedures_performed = excluded.procedures_performed,
            observations = excluded.observations,
            notes = excluded.notes,
            filled_by = excluded.filled_by,
            filled_at = excluded.filled_at,
            created_at = excluded.created_at
        `, {
          id: baphId,
          emergency_call_id: targetCallId,
          glasgow_score: glasgowScore ?? glasgow_score ?? null,
          systolic_bp: systolicBp ?? systolic_bp ?? null,
          diastolic_bp: diastolicBp ?? diastolic_bp ?? null,
          heart_rate: heartRate ?? heart_rate ?? null,
          oxygen_saturation: finalO2,
          o2_sat: finalO2,
          respiratory_rate: respiratoryRate ?? respiratory_rate ?? null,
          procedures_performed: Array.isArray(proceduresPerformed ?? procedures_performed) ? JSON.stringify(proceduresPerformed ?? procedures_performed) : ((proceduresPerformed ?? procedures_performed) || null),
          observations: finalNotes,
          notes: finalNotes,
          filled_by: filledBy ?? filled_by ?? null,
          filled_at: timestamp,
          created_at: timestamp,
        });

        const savedBaph = await dbGet('SELECT * FROM baph_records WHERE emergency_call_id = ?', [targetCallId]);
        io.to(`incident:${targetCallId}`).emit('baph:updated', savedBaph);
        io.to('dispatch_central').emit('baph:updated', savedBaph);
        socket.emit('baph:saved', savedBaph);
      } catch (err) {
        console.error('[Socket] Erro ao salvar BAPH:', err);
      }
    });

    // Central regulator manual dispatch override
    // Spec rooms: dispatch_central | Spec flow: forced dispatch to any pending call
    async function handleManualDispatch({ callId, call_id, id, ambulanceId, ambulance_id }) {
      try {
        const targetCallId = callId || call_id || id;
        const targetAmbId = ambulanceId || ambulance_id;
        const amb = await dbGet('SELECT * FROM ambulances WHERE id = ?', [targetAmbId]);
        const call = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [targetCallId]);
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
          id: targetCallId,
          ambulance_id: targetAmbId,
          driver_id: amb.current_driver_id || null,
          driver_name: amb.current_driver_name || 'Equipe SAMU',
          distance_km: distance,
          eta_minutes: etaMinutes,
          accepted_at: now(),
        });

        await dbRun("UPDATE ambulances SET status = 'busy', updated_at = ? WHERE id = ?", [now(), targetAmbId]);

        const updatedCall = await dbGet('SELECT * FROM emergency_calls WHERE id = ?', [targetCallId]);
        const updatedAmb = await dbGet('SELECT * FROM ambulances WHERE id = ?', [targetAmbId]);

        io.to(`incident:${targetCallId}`).emit('call:accepted', { call: updatedCall, ambulance: updatedAmb });
        if (amb.current_driver_id) {
          io.to(`driver:${amb.current_driver_id}`).emit('driver:force_dispatch', { call: updatedCall, ambulance: updatedAmb });
        }
        io.to('dispatch_central').emit('call:updated', updatedCall);
        io.to('dispatch_central').emit('ambulance:updated', updatedAmb);
      } catch (err) {
        console.error('[Socket] Erro no manual_dispatch:', err);
      }
    }

    socket.on('central:manual_dispatch', handleManualDispatch);
    socket.on('dispatch:manual', handleManualDispatch);
    socket.on('central:force_dispatch', handleManualDispatch);

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
    // Spec event: `dispatch:offer` (alias legado: `driver:dispatch_offer`)
    if (chosen.current_driver_id) {
      io.to(`driver:${chosen.current_driver_id}`).emit('driver:dispatch_offer', offerPayload);
      io.to(`driver:${chosen.current_driver_id}`).emit('dispatch:offer', offerPayload);
    }
    // Also emit to ambulance room and central
    io.to(`ambulance:${chosen.id}`).emit('driver:dispatch_offer', offerPayload);
    io.to(`ambulance:${chosen.id}`).emit('dispatch:offer', offerPayload);
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
