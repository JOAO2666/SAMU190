import React, { useState, useEffect } from 'react';
import {
  Ambulance,
  Power,
  Navigation,
  Clock,
  MessageSquare,
  CheckCircle2,
  Activity,
  Volume2,
} from 'lucide-react';
import { SamuNavbar } from '../components/SamuNavbar';
import { LiveMap } from '../components/LiveMap';
import { ChatDrawer } from '../components/ChatDrawer';
import { getSamuSocket } from '../socket';
import { playEmergencySiren, stopEmergencySiren, playAcceptSound } from '../audio';
import { useAuth } from '../../auth';
import type { EmergencyCall, Ambulance as AmbulanceType, DispatchOffer, HospitalUnit } from '../types';

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
  const [driverHeading] = useState<number>(45);
  const [speed, setSpeed] = useState<number>(0);

  // Active Dispatch Offer & Call
  const [dispatchOffer, setDispatchOffer] = useState<DispatchOffer | null>(null);
  const [countdown, setCountdown] = useState<number>(20);
  const [activeCall, setActiveCall] = useState<EmergencyCall | null>(null);
  const [hospitals, setHospitals] = useState<HospitalUnit[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');

  // BAPH Vital Signs Form
  const [glasgow, setGlasgow] = useState<number>(15);
  const [sysBp, setSysBp] = useState<string>('120');
  const [diaBp, setDiaBp] = useState<string>('80');
  const [heartRate, setHeartRate] = useState<string>('82');
  const [spo2, setSpo2] = useState<string>('98');
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
    socket.on('driver:force_dispatch', onForceDispatch);
    socket.on('call:status_changed', onStatusChanged);

    return () => {
      socket.off('driver:dispatch_offer', onDispatchOffer);
      socket.off('driver:force_dispatch', onForceDispatch);
      socket.off('call:status_changed', onStatusChanged);
      stopEmergencySiren();
    };
  }, [driverId, selectedAmbulanceId, activeCall?.id]);

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
      // Simulate subtle forward motion when on active call
      let newLat = driverPos[0];
      let newLng = driverPos[1];
      let currentSpeed = 0;

      if (activeCall && ['dispatched', 'en_route_pickup'].includes(activeCall.status)) {
        // Move towards patient
        const dLat = (activeCall.pickup_lat - newLat) * 0.08;
        const dLng = (activeCall.pickup_lng - newLng) * 0.08;
        newLat += dLat;
        newLng += dLng;
        currentSpeed = 55; // km/h
        setDriverPos([newLat, newLng]);
        setSpeed(currentSpeed);
      } else if (activeCall && activeCall.status === 'transporting' && selectedHospitalId) {
        // Move towards hospital
        const targetHosp = hospitals.find((h) => h.id === selectedHospitalId);
        if (targetHosp) {
          const dLat = (targetHosp.lat - newLat) * 0.08;
          const dLng = (targetHosp.lng - newLng) * 0.08;
          newLat += dLat;
          newLng += dLng;
          currentSpeed = 60; // km/h
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

    // Optimistic UI update
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

  // Save BAPH digital record
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
      respiratoryRate: 18,
      proceduresPerformed: ['oxigenioterapia', 'acesso_venoso_periferico', 'monitoramento_continuo'],
      observations: 'Paciente estabilizado a caminho da emergência hospitalar.',
    });
    setBaphSaved(true);
    playAcceptSound();
  };

  const selectedAmbulance = ambulances.find((a) => a.id === selectedAmbulanceId);

  // Route coords
  const routePoints: [number, number][] = [driverPos];
  if (activeCall && ['dispatched', 'en_route_pickup'].includes(activeCall.status)) {
    routePoints.push([activeCall.pickup_lat, activeCall.pickup_lng]);
  } else if (activeCall && activeCall.status === 'transporting' && selectedHospitalId) {
    const hosp = hospitals.find((h) => h.id === selectedHospitalId);
    if (hosp) routePoints.push([hosp.lat, hosp.lng]);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-12">
      <SamuNavbar currentApp="driver" />

      {/* FULLSCREEN DISPATCH OFFER MODAL (HIGH PRIORITY SIREN & 20s TIMER) */}
      {dispatchOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-red-950/90 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border-4 border-red-500 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-white text-center relative overflow-hidden animate-pulse">
            {/* Top Bar with Timer */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-red-600 text-white">
                NOVA OCORRÊNCIA DISPARADA
              </span>
              <div className="flex items-center gap-1.5 text-red-400 font-mono font-bold text-sm">
                <Clock className="w-4 h-4 animate-spin" />
                <span>{countdown}s</span>
              </div>
            </div>

            {/* Severity Manchester */}
            <div className="w-20 h-20 rounded-full bg-red-600 mx-auto flex items-center justify-center text-white shadow-xl shadow-red-600/50 mb-3">
              <Ambulance className="w-10 h-10" />
            </div>

            <h2 className="text-2xl font-black text-white">{dispatchOffer.chiefComplaint}</h2>
            <p className="text-red-400 font-bold text-sm mt-0.5">Prioridade: {dispatchOffer.severityColor}</p>

            {/* Info Grid */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 my-5 text-left text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Vítima:</span>
                <strong className="text-white">{dispatchOffer.patientName} ({dispatchOffer.patientAge || 'Adulto'})</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Consciência / Respiração:</span>
                <strong className="text-emerald-400">
                  {dispatchOffer.patientConscious ? 'Consciente' : 'Inconsciente'} /{' '}
                  {dispatchOffer.patientBreathing ? 'Respirando' : 'Parada Resp.'}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Distância / Tempo Estimado:</span>
                <strong className="text-amber-400">{dispatchOffer.distanceKm.toFixed(1)} km (~{dispatchOffer.etaMinutes} min)</strong>
              </div>
              <div className="pt-1 border-t border-slate-700">
                <span className="text-slate-400 block mb-0.5">Endereço da Cena:</span>
                <p className="text-white font-medium">{dispatchOffer.pickupAddress}</p>
              </div>
            </div>

            {/* Giant Accept / Reject Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRejectOffer}
                className="py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-colors cursor-pointer"
              >
                RECUSAR
              </button>

              <button
                type="button"
                onClick={handleAcceptOffer}
                className="py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base tracking-wider uppercase shadow-xl shadow-emerald-600/40 hover:scale-[1.02] transition-all cursor-pointer"
              >
                ACEITAR OCORRÊNCIA
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 w-full flex-1 flex flex-col">
        {/* TOP STATUS BAR: Shift switch & Vehicle selector */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md ${
                isOnline ? 'bg-emerald-600 shadow-emerald-600/30' : 'bg-slate-700'
              }`}
            >
              <Ambulance className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white">{selectedAmbulance?.code || 'USA-01'}</h1>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    isOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isOnline ? 'Em Plantão (Online)' : 'Fora de Serviço'}
                </span>
              </div>
              <p className="text-xs text-slate-400">Condutor: {driverName} | Placa: {selectedAmbulance?.plate || 'BRA-1901'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Vehicle Dropdown */}
            <select
              value={selectedAmbulanceId}
              onChange={(e) => setSelectedAmbulanceId(e.target.value)}
              disabled={!!activeCall}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
            >
              {ambulances.map((amb) => (
                <option key={amb.id} value={amb.id}>
                  {amb.code} ({amb.type}) - {amb.plate}
                </option>
              ))}
            </select>

            {/* Toggle Shift Button */}
            <button
              type="button"
              onClick={handleToggleShift}
              disabled={!!activeCall}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                isOnline
                  ? 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{isOnline ? 'Finalizar Plantão' : 'Iniciar Plantão'}</span>
            </button>
          </div>
        </div>

        {/* ACTIVE CALL HUD (Turn-by-turn navigation & status workflow) */}
        {activeCall ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
            {/* Left Column: Mission Controls & BAPH */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-red-600/20 text-red-400 border border-red-500/30">
                    Ocorrência em Andamento
                  </span>
                  <span className="text-xs font-mono text-slate-400">ID: {activeCall.id.slice(0, 8)}</span>
                </div>

                <h3 className="text-xl font-black text-white mb-1">{activeCall.chief_complaint}</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Solicitante: <strong className="text-white">{activeCall.patient_name || activeCall.citizen_name}</strong>
                </p>

                {/* Status Stepper Progress */}
                <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 mb-5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Etapa Atual da Missão:
                  </span>
                  <div className="text-sm font-extrabold text-amber-400 flex items-center gap-2">
                    <Navigation className="w-4 h-4 animate-spin" />
                    <span>
                      {activeCall.status === 'en_route_pickup' && '1. Deslocando até o local da vítima'}
                      {activeCall.status === 'arrived_scene' && '2. No local - Atendimento e estabilização'}
                      {activeCall.status === 'transporting' && '3. Em transporte para o hospital'}
                      {activeCall.status === 'arrived_hospital' && '4. No hospital - Transição da equipe'}
                    </span>
                  </div>
                </div>

                {/* Primary Action Button (State Transitions) */}
                <div className="space-y-3 mb-5">
                  {activeCall.status === 'en_route_pickup' && (
                    <button
                      type="button"
                      onClick={() => handleAdvanceState('arrived_scene')}
                      className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base uppercase tracking-wider shadow-xl shadow-emerald-600/30 transition-all cursor-pointer"
                    >
                      CHEGUEI AO LOCAL DA OCORRÊNCIA
                    </button>
                  )}

                  {activeCall.status === 'arrived_scene' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                          Selecionar Hospital de Destino:
                        </label>
                        <select
                          value={selectedHospitalId}
                          onChange={(e) => setSelectedHospitalId(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
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
                        className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base uppercase tracking-wider shadow-xl shadow-blue-600/30 transition-all cursor-pointer"
                      >
                        INICIAR TRANSPORTE AO HOSPITAL
                      </button>
                    </div>
                  )}

                  {activeCall.status === 'transporting' && (
                    <button
                      type="button"
                      onClick={() => handleAdvanceState('arrived_hospital')}
                      className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-black text-base uppercase tracking-wider shadow-xl shadow-purple-600/30 transition-all cursor-pointer"
                    >
                      CHEGADA AO HOSPITAL
                    </button>
                  )}

                  {activeCall.status === 'arrived_hospital' && (
                    <button
                      type="button"
                      onClick={() => handleAdvanceState('completed')}
                      className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base uppercase tracking-wider shadow-xl shadow-emerald-600/30 transition-all cursor-pointer"
                    >
                      FINALIZAR OCORRÊNCIA & LIBERAR VIATURA
                    </button>
                  )}
                </div>

                {/* Quick Chat with Requester */}
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  <span>Chat Direto com o Solicitante</span>
                </button>
              </div>

              {/* Digital BAPH Card (Vital Signs in Transit) */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl text-xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-red-500" />
                    <span className="font-bold text-white uppercase tracking-wider text-[11px]">BAPH Digital - Sinais Vitais</span>
                  </div>
                  {baphSaved && (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Sincronizado
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Escala Glasgow (3-15):</label>
                    <input
                      type="number"
                      min={3}
                      max={15}
                      value={glasgow}
                      onChange={(e) => setGlasgow(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Pressão Arterial (PA):</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={sysBp}
                        onChange={(e) => setSysBp(e.target.value)}
                        placeholder="120"
                        className="w-12 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-white"
                      />
                      <span>/</span>
                      <input
                        type="text"
                        value={diaBp}
                        onChange={(e) => setDiaBp(e.target.value)}
                        placeholder="80"
                        className="w-12 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Freq. Cardíaca (BPM):</label>
                    <input
                      type="number"
                      value={heartRate}
                      onChange={(e) => setHeartRate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Saturação O2 (%):</label>
                    <input
                      type="number"
                      value={spo2}
                      onChange={(e) => setSpo2(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveBaph}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Salvar e Transmitir à Central
                </button>
              </div>
            </div>

            {/* Right Column: Navigation Map */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl flex flex-col min-h-[480px]">
              <div className="flex items-center justify-between mb-3 px-2">
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Navegação Turn-by-Turn</span>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {speed > 0 ? `${Math.round(speed)} km/h` : 'Parado'}
                </span>
              </div>

              <div className="flex-1 rounded-2xl overflow-hidden border border-slate-800">
                <LiveMap
                  center={driverPos}
                  zoom={15}
                  citizenPos={[activeCall.pickup_lat, activeCall.pickup_lng]}
                  citizenAddress={activeCall.pickup_address}
                  ambulances={selectedAmbulance ? [{ ...selectedAmbulance, current_lat: driverPos[0], current_lng: driverPos[1] }] : []}
                  hospitals={hospitals}
                  routeCoords={routePoints}
                  activeAmbulanceId={selectedAmbulanceId}
                />
              </div>
            </div>
          </div>
        ) : (
          /* IDLE WAITING FOR CALLS VIEW */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  Plantão Ativo
                </span>
                <h2 className="text-2xl font-black text-white mt-2">Aguardando Ocorrências</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Seu aplicativo está conectado ao motor de despacho automático. Mantenha o volume alto para ouvir o alerta de emergência.
                </p>

                <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 mt-6 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Viatura Alocada:</span>
                    <strong className="text-white">{selectedAmbulance?.code} ({selectedAmbulance?.type})</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Placa:</span>
                    <strong className="text-white">{selectedAmbulance?.plate}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Tempo de Resposta Alvo:</span>
                    <strong className="text-emerald-400">&lt; 8 minutos</strong>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  onClick={() => {
                    playEmergencySiren();
                    setTimeout(stopEmergencySiren, 2000);
                  }}
                  className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  <span>Testar Sirene Sonora (2 seg)</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col min-h-[420px]">
              <div className="flex items-center justify-between mb-3 px-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Área de Cobertura e Bases</span>
                <span className="text-xs text-slate-500">Petrolina / Juazeiro</span>
              </div>
              <div className="flex-1 rounded-2xl overflow-hidden border border-slate-800">
                <LiveMap
                  center={driverPos}
                  zoom={14}
                  ambulances={ambulances}
                  hospitals={hospitals}
                  activeAmbulanceId={selectedAmbulanceId}
                />
              </div>
            </div>
          </div>
        )}
      </main>

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
