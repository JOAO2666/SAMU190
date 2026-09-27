import React, { useState, useEffect } from 'react';
import {
  Ambulance,
  Navigation,
  Clock,
  MessageSquare,
  Activity,
  Volume2,
  FileText,
  X,
} from 'lucide-react';
import { SamuNavbar } from '../components/SamuNavbar';
import { LiveMap } from '../components/LiveMap';
import { ChatDrawer } from '../components/ChatDrawer';
import { getSamuSocket } from '../socket';
import { playEmergencySiren, stopEmergencySiren, playAcceptSound } from '../audio';
import { bearingDegrees, fetchRoadRoute, nextManeuverInstruction, type LatLng } from '../routing';
import { useAuth } from '../../auth';
import type { EmergencyCall, Ambulance as AmbulanceType, DispatchOffer, HospitalUnit } from '../types';

const BAPH_PROCEDURES = [
  { id: 'oxigenioterapia', label: 'Oxigenioterapia' },
  { id: 'acesso_venoso_periferico', label: 'Acesso venoso periférico' },
  { id: 'monitoramento_continuo', label: 'Monitoramento contínuo' },
  { id: 'imobilizacao', label: 'Imobilização' },
  { id: 'controle_hemorragia', label: 'Controle de hemorragia' },
  { id: 'ventilacao', label: 'Ventilação / Vias aéreas' },
];

export const DriverApp: React.FC = () => {
  const { user } = useAuth();
  const driverId = user?.id || 'usr_samu_driver';
  const driverName = user?.name || 'Socorrista Silva (SAMU)';

  // Vehicle Selection & Shift State
  const [ambulances, setAmbulances] = useState<AmbulanceType[]>([]);
  const [selectedAmbulanceId, setSelectedAmbulanceId] = useState<string>('amb_usa_01');
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Driver GPS Location
  const [driverPos, setDriverPos] = useState<[number, number]>([-9.3950, -40.5050]);
  const [driverHeading, setDriverHeading] = useState<number>(45);
  const [speed, setSpeed] = useState<number>(0);
  const [roadRoute, setRoadRoute] = useState<LatLng[]>([]);
  const [nextManeuver, setNextManeuver] = useState<string>('Siga em frente');

  // Active Dispatch Offer & Call
  const [dispatchOffer, setDispatchOffer] = useState<DispatchOffer | null>(null);
  const [countdown, setCountdown] = useState<number>(20);
  const [activeCall, setActiveCall] = useState<EmergencyCall | null>(null);
  const [hospitals, setHospitals] = useState<HospitalUnit[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');

  // BAPH Vital Signs Form Modal (spec §4: Glasgow, PA, FC, SpO2, observações, regulação)
  const [baphOpen, setBaphOpen] = useState<boolean>(false);
  const [glasgow, setGlasgow] = useState<number>(15);
  const [sysBp, setSysBp] = useState<string>('120');
  const [diaBp, setDiaBp] = useState<string>('80');
  const [heartRate, setHeartRate] = useState<string>('82');
  const [spo2, setSpo2] = useState<string>('98');
  const [respRate, setRespRate] = useState<string>('18');
  const [baphNotes, setBaphNotes] = useState<string>('');
  const [baphProcedures, setBaphProcedures] = useState<string[]>(['oxigenioterapia', 'acesso_venoso_periferico', 'monitoramento_continuo']);
  const [baphSaved, setBaphSaved] = useState<boolean>(false);

  // Chat Drawer
  const [chatOpen, setChatOpen] = useState<boolean>(false);

  // Load ambulances and hospitals
  useEffect(() => {
    fetch('/api/samu/ambulances')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAmbulances(data);
          const found = data.find((a) => a.current_driver_id === driverId) || data[0];
          if (found) {
            setSelectedAmbulanceId(found.id);
            if (found.current_lat && found.current_lng) {
              setDriverPos([found.current_lat, found.current_lng]);
            }
          }
        }
      })
      .catch(() => {});

    fetch('/api/samu/hospitals')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setHospitals(data);
          if (data.length > 0) setSelectedHospitalId(data[0].id);
        }
      })
      .catch(() => {});

    // Check active call for driver
    fetch('/api/samu/calls/active')
      .then((r) => r.json())
      .then((calls) => {
        if (Array.isArray(calls)) {
          const myCall = calls.find((c: EmergencyCall) => c.driver_id === driverId || c.ambulance_id === selectedAmbulanceId);
          if (myCall) setActiveCall(myCall);
        }
      })
      .catch(() => {});
  }, [driverId, selectedAmbulanceId]);

  // Socket setup & Listeners
  useEffect(() => {
    const socket = getSamuSocket();
    socket.emit('driver:join', { driverId, ambulanceId: selectedAmbulanceId });

    if (activeCall?.id) {
      socket.emit('incident:join', { callId: activeCall.id });
    }

    const onDispatchOffer = (offer: DispatchOffer) => {
      setDispatchOffer(offer);
      setCountdown(20);
      playEmergencySiren();
    };

    const onForceDispatch = ({ call }: { call: EmergencyCall }) => {
      setActiveCall(call);
      stopEmergencySiren();
      setDispatchOffer(null);
      playAcceptSound();
    };

    const onStatusChanged = (call: EmergencyCall) => {
      if (activeCall && call.id === activeCall.id) {
        setActiveCall(call);
      }
    };

    socket.on('driver:dispatch_offer', onDispatchOffer);
    socket.on('dispatch:offer', onDispatchOffer);
    socket.on('driver:force_dispatch', onForceDispatch);
    socket.on('call:status_changed', onStatusChanged);

    return () => {
      socket.off('driver:dispatch_offer', onDispatchOffer);
      socket.off('dispatch:offer', onDispatchOffer);
      socket.off('driver:force_dispatch', onForceDispatch);
      socket.off('call:status_changed', onStatusChanged);
      stopEmergencySiren();
    };
  }, [driverId, selectedAmbulanceId, activeCall?.id]);

  // GPS real do aparelho (quando disponível) — fallback mantém simulação de deslocamento
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setDriverPos((prev) => {
          if (Math.abs(prev[0] - coords[0]) > 0.00001 || Math.abs(prev[1] - coords[1]) > 0.00001) {
            setDriverHeading(bearingDegrees(prev, coords));
          }
          return coords;
        });
        if (pos.coords.speed && pos.coords.speed > 1) {
          setSpeed(Math.round(pos.coords.speed * 3.6));
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Rota viária real (OSRM) + próxima manobra turn-by-turn para o HUD
  useEffect(() => {
    const dest: LatLng | null = activeCall && ['dispatched', 'en_route_pickup'].includes(activeCall.status)
      ? [activeCall.pickup_lat, activeCall.pickup_lng]
      : activeCall && activeCall.status === 'transporting'
        ? (() => {
            const hosp = hospitals.find((h) => h.id === (activeCall.target_hospital_id || selectedHospitalId));
            return hosp ? ([hosp.lat, hosp.lng] as LatLng) : null;
          })()
        : null;
    if (!dest) {
      setRoadRoute([]);
      return;
    }
    let cancelled = false;
    void fetchRoadRoute(driverPos, dest).then((route) => {
      if (cancelled) return;
      setRoadRoute(route.coords);
      setNextManeuver(route.maneuver || nextManeuverInstruction(driverHeading, driverPos, dest));
    });
    return () => {
      cancelled = true;
    };
  }, [driverPos, activeCall?.status, activeCall?.pickup_lat, activeCall?.pickup_lng, activeCall?.target_hospital_id, selectedHospitalId, hospitals, driverHeading, activeCall]);

  // Countdown timer for dispatch offer
  useEffect(() => {
    if (!dispatchOffer) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          stopEmergencySiren();
          setDispatchOffer(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [dispatchOffer]);

  // Simulated GPS Telemetry Ping (broadcasting every 3s)
  useEffect(() => {
    if (!isOnline || !selectedAmbulanceId) return;

    const interval = setInterval(() => {
      let newLat = driverPos[0];
      let newLng = driverPos[1];
      let currentSpeed = 0;

      if (activeCall && ['dispatched', 'en_route_pickup'].includes(activeCall.status)) {
        const dLat = (activeCall.pickup_lat - newLat) * 0.08;
        const dLng = (activeCall.pickup_lng - newLng) * 0.08;
        newLat += dLat;
        newLng += dLng;
        currentSpeed = 58;
        if (Math.abs(dLat) > 1e-7 || Math.abs(dLng) > 1e-7) {
          setDriverHeading(bearingDegrees(driverPos, [newLat, newLng]));
        }
        setDriverPos([newLat, newLng]);
        setSpeed(currentSpeed);
      } else if (activeCall && activeCall.status === 'transporting' && selectedHospitalId) {
        const targetHosp = hospitals.find((h) => h.id === selectedHospitalId);
        if (targetHosp) {
          const dLat = (targetHosp.lat - newLat) * 0.08;
          const dLng = (targetHosp.lng - newLng) * 0.08;
          newLat += dLat;
          newLng += dLng;
          currentSpeed = 64;
          if (Math.abs(dLat) > 1e-7 || Math.abs(dLng) > 1e-7) {
            setDriverHeading(bearingDegrees(driverPos, [newLat, newLng]));
          }
          setDriverPos([newLat, newLng]);
          setSpeed(currentSpeed);
        }
      }

      const socket = getSamuSocket();
      socket.emit('driver:telemetry_ping', {
        ambulanceId: selectedAmbulanceId,
        callId: activeCall?.id || null,
        lat: newLat,
        lng: newLng,
        heading: driverHeading,
        speed: currentSpeed,
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isOnline, selectedAmbulanceId, activeCall, driverPos, driverHeading, selectedHospitalId, hospitals]);

  // Toggle Shift Status
  const handleToggleShift = () => {
    const nextStatus = !isOnline;
    setIsOnline(nextStatus);
    const socket = getSamuSocket();
    socket.emit('driver:toggle_shift', {
      driverId,
      driverName,
      ambulanceId: selectedAmbulanceId,
      status: nextStatus ? 'available' : 'offline',
      lat: driverPos[0],
      lng: driverPos[1],
    });
  };

  // Accept Dispatch Offer
  const handleAcceptOffer = () => {
    if (!dispatchOffer) return;
    stopEmergencySiren();
    playAcceptSound();

    const socket = getSamuSocket();
    socket.emit('driver:accept_call', {
      callId: dispatchOffer.callId,
      driverId,
      ambulanceId: selectedAmbulanceId,
    });

    setActiveCall({
      id: dispatchOffer.callId,
      citizen_id: '',
      citizen_name: dispatchOffer.patientName,
      status: 'en_route_pickup',
      severity_color: dispatchOffer.severityColor,
      chief_complaint: dispatchOffer.chiefComplaint,
      patient_name: dispatchOffer.patientName,
      patient_age: dispatchOffer.patientAge,
      patient_conscious: dispatchOffer.patientConscious,
      patient_breathing: dispatchOffer.patientBreathing,
      pickup_lat: dispatchOffer.pickupLat,
      pickup_lng: dispatchOffer.pickupLng,
      pickup_address: dispatchOffer.pickupAddress,
      distance_km: dispatchOffer.distanceKm,
      eta_minutes: dispatchOffer.etaMinutes,
      requested_at: new Date().toISOString(),
    });

    setDispatchOffer(null);
  };

  // Reject Dispatch Offer
  const handleRejectOffer = () => {
    if (!dispatchOffer) return;
    stopEmergencySiren();

    const socket = getSamuSocket();
    socket.emit('driver:reject_call', {
      callId: dispatchOffer.callId,
      ambulanceId: selectedAmbulanceId,
    });

    setDispatchOffer(null);
  };

  // Advance Ride State
  const handleAdvanceState = (nextStatus: any) => {
    if (!activeCall) return;
    const socket = getSamuSocket();
    const targetHosp = hospitals.find((h) => h.id === selectedHospitalId);

    socket.emit('driver:advance_status', {
      callId: activeCall.id,
      nextStatus,
      targetHospitalId: targetHosp?.id || null,
      targetHospitalName: targetHosp?.name || null,
    });

    if (nextStatus === 'completed') {
      setActiveCall(null);
      setBaphSaved(false);
      playAcceptSound();
    }
  };

  // Save BAPH digital record (spec §4: Glasgow, PA, FC, SpO2, FR, observações)
  const handleSaveBaph = () => {
    if (!activeCall) return;
    const socket = getSamuSocket();
    socket.emit('driver:save_baph', {
      callId: activeCall.id,
      glasgowScore: glasgow,
      systolicBp: Number(sysBp),
      diastolicBp: Number(diaBp),
      heartRate: Number(heartRate),
      oxygenSaturation: Number(spo2),
      o2_sat: Number(spo2),
      respiratoryRate: Number(respRate),
      proceduresPerformed: baphProcedures,
      observations: baphNotes || 'Paciente estabilizado a caminho da emergência hospitalar.',
      notes: baphNotes || 'Paciente estabilizado a caminho da emergência hospitalar.',
      filledBy: driverName,
    });
    setBaphSaved(true);
    setBaphOpen(false);
    playAcceptSound();
  };

  const toggleBaphProcedure = (id: string) => {
    setBaphProcedures((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const selectedAmbulance = ambulances.find((a) => a.id === selectedAmbulanceId);

  // Route coords: prefere rota viária real OSRM; fallback para linha reta
  const routePoints: [number, number][] = roadRoute.length > 1
    ? roadRoute
    : (() => {
        const pts: [number, number][] = [driverPos];
        if (activeCall && ['dispatched', 'en_route_pickup'].includes(activeCall.status)) {
          pts.push([activeCall.pickup_lat, activeCall.pickup_lng]);
        } else if (activeCall && activeCall.status === 'transporting' && selectedHospitalId) {
          const hosp = hospitals.find((h) => h.id === selectedHospitalId);
          if (hosp) pts.push([hosp.lat, hosp.lng]);
        }
        return pts;
      })();

  return (
    <div className="relative w-full h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      <SamuNavbar currentApp="driver" />

      {/* FULLSCREEN DISPATCH OFFER MODAL (HIGH PRIORITY ALARM WITH 20s TIMER) */}
      {dispatchOffer && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-md shadow-2xl p-6 text-white text-center relative overflow-hidden">
            {/* Top Bar with Timer */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-red-600 text-white">
                Nova Ocorrência
              </span>
              <div className="flex items-center gap-1.5 text-red-400 font-mono font-bold text-sm bg-red-950/40 px-2.5 py-1 rounded-full border border-red-500/30">
                <Clock className="w-4 h-4 animate-spin" />
                <span>{countdown}s</span>
              </div>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-red-600/20 text-red-500 border border-red-500/30 mx-auto flex items-center justify-center mb-3">
              <Ambulance className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-bold text-white tracking-tight">{dispatchOffer.chiefComplaint}</h2>
            <p className="text-red-400 font-bold text-xs uppercase tracking-wider mt-1">
              Prioridade: {dispatchOffer.severityColor}
            </p>

            {/* Info Grid */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 my-4 text-left text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Vítima:</span>
                <strong className="text-white">{dispatchOffer.patientName} ({dispatchOffer.patientAge || 'Adulto'})</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Estado Clínico:</span>
                <strong className="text-emerald-400">
                  {dispatchOffer.patientConscious ? 'Consciente' : 'Inconsciente'} •{' '}
                  {dispatchOffer.patientBreathing ? 'Respirando' : 'Parada Resp.'}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Distância / Chegada:</span>
                <strong className="text-amber-400 font-mono">{dispatchOffer.distanceKm.toFixed(1)} km (~{dispatchOffer.etaMinutes} min)</strong>
              </div>
              <div className="pt-2 border-t border-zinc-800">
                <span className="text-zinc-400 block mb-0.5 text-[10px] uppercase font-bold">Endereço da Cena:</span>
                <p className="text-white font-medium truncate">{dispatchOffer.pickupAddress}</p>
              </div>
            </div>

            {/* Large Glove-Friendly Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRejectOffer}
                className="py-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Recusar
              </button>

              <button
                type="button"
                onClick={handleAcceptOffer}
                className="py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider uppercase shadow-lg transition-transform active:scale-95 cursor-pointer"
              >
                Aceitar Chamado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN NAVIGATION MAP */}
      <div className="relative flex-1 w-full h-full">
        <LiveMap
          center={driverPos}
          zoom={15}
          citizenPos={activeCall ? [activeCall.pickup_lat, activeCall.pickup_lng] : undefined}
          citizenAddress={activeCall?.pickup_address}
          ambulances={selectedAmbulance ? [{ ...selectedAmbulance, current_lat: driverPos[0], current_lng: driverPos[1], current_heading: driverHeading, speed }] : []}
          hospitals={hospitals}
          routeCoords={routePoints}
          activeAmbulanceId={selectedAmbulanceId}
          className="w-full h-full"
        />

        {/* FLOATING TOP NAVIGATION HUD (velocímetro + próxima manobra turn-by-turn) */}
        {activeCall && (
          <div className="absolute top-4 left-4 right-4 sm:left-6 sm:w-[420px] z-[999] pointer-events-auto">
            <div className="bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-2xl p-4 shadow-xl flex items-center justify-between gap-3 text-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-md">
                  <Navigation className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">{nextManeuver}</span>
                  <p className="text-xs font-bold text-white truncate">
                    {activeCall.status === 'transporting'
                      ? hospitals.find((h) => h.id === selectedHospitalId)?.name || 'Hospital de Referência'
                      : activeCall.pickup_address}
                  </p>
                </div>
              </div>

              {/* Speedometer Badge */}
              <div className="text-right shrink-0 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
                <span className="text-xs font-mono font-bold text-emerald-400 block">
                  {speed > 0 ? `${Math.round(speed)} km/h` : 'Parado'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* FLOATING BOTTOM COCKPIT DOCK */}
        <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:w-[460px] z-[999] pointer-events-auto max-h-[85vh] overflow-y-auto">
          {activeCall ? (
            /* MISSION IN PROGRESS CARD */
            <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-5 shadow-2xl text-zinc-100">
              <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-3" />

              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div>
                  <span className="text-xs font-bold text-red-500 uppercase tracking-wider block">
                    {activeCall.chief_complaint}
                  </span>
                  <span className="text-xs text-zinc-400 font-medium">
                    Paciente: <strong className="text-white">{activeCall.patient_name || activeCall.citizen_name}</strong>
                  </span>
                </div>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  Chamado #{activeCall.id.slice(0, 6)}
                </span>
              </div>

              {/* Progressive Mission Action Button */}
              <div className="my-4">
                {activeCall.status === 'en_route_pickup' && (
                  <button
                    type="button"
                    onClick={() => handleAdvanceState('arrived_scene')}
                    className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-sm tracking-wide uppercase transition-all shadow-lg cursor-pointer"
                  >
                    Cheguei ao Local da Vítima
                  </button>
                )}

                {activeCall.status === 'arrived_scene' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        Hospital de Encaminhamento:
                      </label>
                      <select
                        value={selectedHospitalId}
                        onChange={(e) => setSelectedHospitalId(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white"
                      >
                        {hospitals.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.city} - {h.distance_km}km)
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAdvanceState('transporting')}
                      className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-bold text-sm tracking-wide uppercase transition-all shadow-lg cursor-pointer"
                    >
                      Iniciar Transporte ao Hospital
                    </button>
                  </div>
                )}

                {activeCall.status === 'transporting' && (
                  <button
                    type="button"
                    onClick={() => handleAdvanceState('arrived_hospital')}
                    className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-[0.99] text-white font-bold text-sm tracking-wide uppercase transition-all shadow-lg cursor-pointer"
                  >
                    Confirmar Chegada ao Hospital
                  </button>
                )}

                {activeCall.status === 'arrived_hospital' && (
                  <button
                    type="button"
                    onClick={() => handleAdvanceState('completed')}
                    className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-sm tracking-wide uppercase transition-all shadow-lg cursor-pointer"
                  >
                    Concluir Ocorrência & Liberar Viatura
                  </button>
                )}
              </div>

              {/* Secondary Actions (BAPH & Chat) */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setBaphOpen(true)}
                  className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Activity className="w-4 h-4 text-red-500" />
                  <span>{baphSaved ? 'BAPH Sincronizado' : 'Prontuário BAPH'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  <span>Chat Solicitante</span>
                </button>
              </div>
            </div>
          ) : (
            /* IDLE SHIFT CARD */
            <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-5 shadow-2xl text-zinc-100">
              <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-3" />

              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${isOnline ? 'bg-emerald-600' : 'bg-zinc-800'}`}>
                    <Ambulance className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedAmbulance?.code || 'USA-01'}</h3>
                    <span className="text-[11px] text-zinc-400">
                      {isOnline ? 'Pronto para despacho' : 'Fora de serviço'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleShift}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    isOnline ? 'bg-zinc-800 text-zinc-300 hover:text-white' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {isOnline ? 'Pausar' : 'Ficar Online'}
                </button>
              </div>

              {/* Vehicle & Siren Test */}
              <div className="pt-3 flex items-center justify-between text-xs">
                <select
                  value={selectedAmbulanceId}
                  onChange={(e) => setSelectedAmbulanceId(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-zinc-300 text-xs"
                >
                  {ambulances.map((amb) => (
                    <option key={amb.id} value={amb.id}>
                      {amb.code} ({amb.type})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    playEmergencySiren();
                    setTimeout(stopEmergencySiren, 2000);
                  }}
                  className="text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                  <span>Testar Alarme</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BAPH VITAL SIGNS MODAL */}
      {baphOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-500" />
                <h3 className="font-bold text-sm">BAPH Digital - Sinais Vitais</h3>
              </div>
              <button onClick={() => setBaphOpen(false)} className="text-zinc-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 my-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">Escala Glasgow (3-15):</label>
                  <input
                    type="number"
                    min={3}
                    max={15}
                    value={glasgow}
                    onChange={(e) => setGlasgow(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-center"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">Pressão Arterial (PA):</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={sysBp}
                      onChange={(e) => setSysBp(e.target.value)}
                      className="w-12 bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1.5 text-center text-white font-mono"
                    />
                    <span className="text-zinc-500">/</span>
                    <input
                      type="text"
                      value={diaBp}
                      onChange={(e) => setDiaBp(e.target.value)}
                      className="w-12 bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1.5 text-center text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">FC (BPM):</label>
                  <input
                    type="number"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-center"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">SpO2 (%):</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-center"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">FR (irpm):</label>
                  <input
                    type="number"
                    value={respRate}
                    onChange={(e) => setRespRate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-center"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 block mb-1.5">Procedimentos em trânsito:</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {BAPH_PROCEDURES.map((proc) => (
                    <button
                      key={proc.id}
                      type="button"
                      onClick={() => toggleBaphProcedure(proc.id)}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer text-left ${
                        baphProcedures.includes(proc.id)
                          ? 'bg-red-950/50 border-red-500/50 text-red-200'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      {baphProcedures.includes(proc.id) ? '✓ ' : ''}{proc.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">Observações clínicas / regulação médica:</label>
                <textarea
                  value={baphNotes}
                  onChange={(e) => setBaphNotes(e.target.value)}
                  rows={2}
                  placeholder="Ex: Paciente consciente, PA estável, sem sangramento ativo. Regulação orientou UPAE..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-white text-xs placeholder-zinc-600"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveBaph}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-xs uppercase tracking-wider text-white transition-colors cursor-pointer"
            >
              Salvar e Transmitir à Central
            </button>
          </div>
        </div>
      )}

      {/* Chat Drawer */}
      {activeCall && (
        <ChatDrawer
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          callId={activeCall.id}
          currentUserId={driverId}
          currentUserName={driverName}
          currentUserRole="driver"
          initialMessages={activeCall.messages || []}
        />
      )}
    </div>
  );
};
