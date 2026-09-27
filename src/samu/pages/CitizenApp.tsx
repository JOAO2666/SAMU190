import React, { useState, useEffect } from 'react';
import {
  Siren,
  MapPin,
  HeartPulse,
  MessageSquare,
  Share2,
  Ambulance,
  Radar,
  X,
} from 'lucide-react';
import { SamuNavbar } from '../components/SamuNavbar';
import { LiveMap } from '../components/LiveMap';
import { CPRMetronomeModal } from '../components/CPRMetronomeModal';
import { ChatDrawer } from '../components/ChatDrawer';
import { getSamuSocket } from '../socket';
import { playAcceptSound, playBeep } from '../audio';
import { fetchRoadRoute, formatDistance, type LatLng } from '../routing';
import { useAuth } from '../../auth';
import type { EmergencyCall, Ambulance as AmbulanceType, HospitalUnit } from '../types';

export const CitizenApp: React.FC = () => {
  const { user } = useAuth();
  const citizenId = user?.id || 'usr_samu_citizen';
  const citizenName = user?.name || 'José da Silva (Cidadão)';

  // Geolocation state
  const [userPos, setUserPos] = useState<[number, number]>([-9.3950, -40.5050]);
  const [address, setAddress] = useState('Av. Coronel Honorato Viana, Petrolina - PE');
  const [isLocating, setIsLocating] = useState(false);

  // Triage inputs (Manchester expressa + toggles clínicos de resposta rápida)
  const [chiefComplaint, setChiefComplaint] = useState('Dor torácica súbita com irradiação para o braço');
  const [severityColor, setSeverityColor] = useState<'Vermelho' | 'Laranja' | 'Amarelo' | 'Verde'>('Vermelho');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientConscious, setPatientConscious] = useState(true);
  const [patientBreathing, setPatientBreathing] = useState(true);
  const [chestPain, setChestPain] = useState(true);

  // App States: 'IDLE' | 'SEARCHING' | 'IN_PROGRESS' | 'COMPLETED'
  const [activeCall, setActiveCall] = useState<EmergencyCall | null>(null);
  const [assignedAmbulance, setAssignedAmbulance] = useState<AmbulanceType | null>(null);
  const [hospitals, setHospitals] = useState<HospitalUnit[]>([]);
  const [nearbyAmbulances, setNearbyAmbulances] = useState<AmbulanceType[]>([]);
  const [roadRoute, setRoadRoute] = useState<LatLng[]>([]);
  const [liveEtaMin, setLiveEtaMin] = useState<number | null>(null);
  const [liveDistKm, setLiveDistKm] = useState<number | null>(null);

  // Modals
  const [cprOpen, setCprOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [copyNotice, setCopyNotice] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Reverse geocoding helper
  const updateAddressFromCoords = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data?.display_name) {
        setAddress(data.display_name.split(',').slice(0, 3).join(', '));
      }
    } catch {
      setAddress(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
    }
  };

  // Get initial GPS location
  useEffect(() => {
    if ('geolocation' in navigator) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserPos(coords);
          setIsLocating(false);
          updateAddressFromCoords(coords[0], coords[1]);
        },
        () => {
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    // Load hospitals
    fetch('/api/samu/hospitals')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setHospitals(data);
      })
      .catch(() => {});

    // Radar: frota disponível para animação de despacho estilo Uber
    fetch('/api/samu/ambulances')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setNearbyAmbulances(data.filter((a: AmbulanceType) => a.status === 'available'));
        }
      })
      .catch(() => {});

    // Deep-link de rastreio para familiares (?call=ID compartilhado via WhatsApp)
    const sharedCallId = new URLSearchParams(window.location.search).get('call');
    if (sharedCallId) {
      fetch(`/api/samu/calls/${encodeURIComponent(sharedCallId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((call) => {
          if (call && call.id) {
            setActiveCall(call);
            if (call.pickup_lat && call.pickup_lng) setUserPos([call.pickup_lat, call.pickup_lng]);
            if (call.ambulance_id) {
              fetch('/api/samu/ambulances')
                .then((r) => r.json())
                .then((ambs) => {
                  const found = (ambs as AmbulanceType[]).find((a) => a.id === call.ambulance_id);
                  if (found) setAssignedAmbulance(found);
                })
                .catch(() => {});
            }
          }
        })
        .catch(() => {});
      return;
    }

    // Check if user already has an active call
    fetch('/api/samu/calls/active')
      .then((r) => r.json())
      .then((calls) => {
        if (Array.isArray(calls)) {
          const myCall = calls.find((c: EmergencyCall) => c.citizen_id === citizenId);
          if (myCall) {
            setActiveCall(myCall);
            if (myCall.ambulance_id) {
              fetch('/api/samu/ambulances')
                .then((r) => r.json())
                .then((ambs) => {
                  const found = ambs.find((a: AmbulanceType) => a.id === myCall.ambulance_id);
                  if (found) setAssignedAmbulance(found);
                });
            }
          }
        }
      })
      .catch(() => {});
  }, [citizenId]);

  // Socket.io Realtime Listeners
  useEffect(() => {
    const socket = getSamuSocket();
    socket.emit('citizen:join', { userId: citizenId });

    if (activeCall?.id) {
      socket.emit('incident:join', { callId: activeCall.id });
    }

    const onCallCreated = (call: EmergencyCall) => {
      setActiveCall(call);
      playBeep(880, 150);
    };

    const onCallAccepted = ({ call, ambulance }: { call: EmergencyCall; ambulance: AmbulanceType }) => {
      setActiveCall(call);
      setAssignedAmbulance(ambulance);
      playAcceptSound();
    };

    const onStatusChanged = (call: EmergencyCall) => {
      setActiveCall(call);
      if (call.status === 'completed' || call.status === 'cancelled') {
        setTimeout(() => {
          setActiveCall(null);
          setAssignedAmbulance(null);
          setRoadRoute([]);
        }, 6000);
      } else {
        playBeep(880, 200);
      }
    };

    const onCallCancelled = (call: EmergencyCall) => {
      setActiveCall(call.status === 'cancelled' ? call : null);
      if (call.status === 'cancelled') {
        setAssignedAmbulance(null);
        setRoadRoute([]);
      }
    };

    const onTelemetry = (telemetry: any) => {
      if (activeCall && telemetry.callId === activeCall.id) {
        setAssignedAmbulance((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            current_lat: telemetry.lat,
            current_lng: telemetry.lng,
            current_heading: telemetry.heading,
            speed: telemetry.speed,
          };
        });
      }
    };

    socket.on('call:created', onCallCreated);
    socket.on('call:accepted', onCallAccepted);
    socket.on('call:status_changed', onStatusChanged);
    socket.on('call:cancelled', onCallCancelled);
    socket.on('ambulance:telemetry', onTelemetry);

    return () => {
      socket.off('call:created', onCallCreated);
      socket.off('call:accepted', onCallAccepted);
      socket.off('call:status_changed', onStatusChanged);
      socket.off('call:cancelled', onCallCancelled);
      socket.off('ambulance:telemetry', onTelemetry);
    };
  }, [citizenId, activeCall?.id]);

  // Rota viária real (OSRM) entre viatura e paciente — Live Ride com ETA dinâmico
  useEffect(() => {
    if (!activeCall || !assignedAmbulance?.current_lat || !assignedAmbulance?.current_lng) {
      if (!activeCall) {
        setRoadRoute([]);
        setLiveEtaMin(null);
        setLiveDistKm(null);
      }
      return;
    }
    let cancelled = false;
    const from: LatLng = [assignedAmbulance.current_lat, assignedAmbulance.current_lng];
    const to: LatLng = [activeCall.status === 'transporting' && hospitals.length > 0
      ? (hospitals.find((h) => h.id === activeCall.target_hospital_id)?.lat ?? userPos[0])
      : userPos[0],
      activeCall.status === 'transporting' && hospitals.length > 0
      ? (hospitals.find((h) => h.id === activeCall.target_hospital_id)?.lng ?? userPos[1])
      : userPos[1]];
    void fetchRoadRoute(from, to).then((route) => {
      if (cancelled) return;
      setRoadRoute(route.coords);
      setLiveEtaMin(route.durationMin);
      setLiveDistKm(route.distanceKm);
    });
    return () => {
      cancelled = true;
    };
  }, [assignedAmbulance?.current_lat, assignedAmbulance?.current_lng, userPos, activeCall?.status, activeCall?.target_hospital_id, hospitals, activeCall]);

  // Request Emergency Button Action (spec: citizen:request_call)
  const handleRequestEmergency = () => {
    const socket = getSamuSocket();
    const payload = {
      citizenId,
      citizenName,
      pickupLat: userPos[0],
      pickupLng: userPos[1],
      pickupAddress: address,
      severityColor,
      chiefComplaint,
      patientName: patientName || citizenName,
      patientAge: patientAge ? Number(patientAge) : undefined,
      patientConscious,
      patientBreathing,
      chestPain,
      unconscious: !patientConscious,
      notBreathing: !patientBreathing,
    };
    socket.emit('citizen:request_call', payload);
    // Compat legado
    socket.emit('citizen:request_emergency', payload);
  };

  // Cancel Request Action (socket + fallback REST)
  const handleCancelRequest = () => {
    if (!activeCall) return;
    const socket = getSamuSocket();
    socket.emit('citizen:cancel_call', {
      callId: activeCall.id,
      reason: 'Cancelado pelo solicitante',
    });
    fetch(`/api/samu/calls/${encodeURIComponent(activeCall.id)}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Cancelado pelo solicitante' }),
    }).catch(() => {});
    setActiveCall(null);
    setAssignedAmbulance(null);
    setRoadRoute([]);
  };

  // Share Live Ride WhatsApp (texto sóbrio, sem emoji — padrão anti-vibe coding)
  const handleShareWhatsApp = () => {
    const shareUrl = `${window.location.origin}/samu/cidadao?call=${activeCall?.id || ''}`;
    const text = encodeURIComponent(
      `SAMU 190 - Acompanhamento de resgate em tempo real. Uma ambulancia foi solicitada para ${address}. Acompanhe a aproximacao pelo link: ${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    setCopyNotice(true);
    setTimeout(() => setCopyNotice(false), 3000);
  };

  // Route points: prefere rota viária OSRM; fallback para linha reta
  const routePoints: [number, number][] = roadRoute.length > 1
    ? roadRoute
    : (() => {
        const pts: [number, number][] = [];
        if (userPos && userPos[0]) pts.push(userPos);
        if (assignedAmbulance?.current_lat && assignedAmbulance?.current_lng) {
          pts.unshift([assignedAmbulance.current_lat, assignedAmbulance.current_lng]);
        }
        return pts;
      })();

  const etaDisplay = liveEtaMin ?? activeCall?.eta_minutes ?? 4;
  const distDisplay = liveDistKm !== null && liveDistKm !== undefined
    ? formatDistance(liveDistKm)
    : activeCall?.distance_km
      ? formatDistance(activeCall.distance_km)
      : 'Em deslocamento';

  const getStatusText = () => {
    if (!activeCall) return '';
    switch (activeCall.status) {
      case 'searching':
        return 'Localizando viatura mais próxima...';
      case 'offered':
        return 'Viatura localizada. Aguardando aceite...';
      case 'dispatched':
      case 'en_route_pickup':
        return 'Ambulância a caminho';
      case 'arrived_scene':
        return 'Ambulância no local da ocorrência';
      case 'transporting':
        return 'Em transporte para o hospital';
      case 'arrived_hospital':
        return 'Chegada ao hospital / Pronto-Socorro';
      case 'completed':
        return 'Atendimento finalizado';
      default:
        return 'Chamado registrado';
    }
  };

  return (
    <div className="relative w-full h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      <SamuNavbar currentApp="citizen" />

      {/* FULLSCREEN INTERACTIVE MAP (UBER PATTERN) */}
      <div className="relative flex-1 w-full h-full">
        <LiveMap
          center={userPos}
          zoom={15}
          citizenPos={userPos}
          citizenAddress={address}
          ambulances={assignedAmbulance ? [assignedAmbulance] : []}
          hospitals={hospitals}
          routeCoords={routePoints}
          activeAmbulanceId={assignedAmbulance?.id}
          className="w-full h-full"
        />

        {/* FLOATING TOP ADDRESS BAR (When Idle) */}
        {!activeCall && (
          <div className="absolute top-4 left-4 right-4 sm:left-6 sm:w-96 z-[999] pointer-events-auto">
            <div className="bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-2xl p-3 shadow-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-600/20 text-red-500 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Sua Localização</span>
                  {isLocating && <span className="text-[10px] text-amber-400 font-mono animate-pulse">Obtendo GPS...</span>}
                </div>
                <p className="text-xs font-semibold text-white truncate mt-0.5">{address}</p>
              </div>
            </div>
          </div>
        )}

        {/* UBER-STYLE BOTTOM SHEET DOCK */}
        <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:w-[460px] z-[999] pointer-events-auto max-h-[85vh] overflow-y-auto">
          {/* VIEW 1: REQUEST RESCUE (Clean Bottom Sheet) */}
          {!activeCall && (
            <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-5 shadow-2xl text-zinc-100">
              {/* Drag Handle */}
              <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />

              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Solicitar SAMU 192</h2>
                  <p className="text-xs text-zinc-400">Atendimento Pré-Hospitalar de Urgência</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCprOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Primeiros Socorros"
                >
                  <HeartPulse className="w-3.5 h-3.5 text-red-500" />
                  <span>Guia RCP</span>
                </button>
              </div>

              {/* Manchester Priority Chips */}
              <div className="mb-4">
                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                  Gravidade (Triagem de Manchester)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { color: 'Vermelho', label: 'Emergência', dot: 'bg-red-500' },
                    { color: 'Laranja', label: 'Muito Urg.', dot: 'bg-orange-500' },
                    { color: 'Amarelo', label: 'Urgente', dot: 'bg-yellow-500' },
                    { color: 'Verde', label: 'Pouco Urg.', dot: 'bg-emerald-500' },
                  ].map((item) => (
                    <button
                      key={item.color}
                      type="button"
                      onClick={() => setSeverityColor(item.color as any)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        severityColor === item.color
                          ? 'border-red-600 bg-red-950/40 text-white font-bold'
                          : 'border-zinc-800 bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${item.dot} inline-block mb-1`} />
                      <span className="block text-xs leading-none">{item.color}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles clínicos de resposta rápida: inconsciente / não respira / dor no peito */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-zinc-950/60 border border-zinc-800 p-2.5 rounded-xl flex flex-col items-center gap-1.5">
                  <span className="text-[11px] text-zinc-300">Inconsciente?</span>
                  <button
                    type="button"
                    onClick={() => setPatientConscious(!patientConscious)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                      patientConscious ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                    }`}
                  >
                    {patientConscious ? 'NÃO' : 'SIM'}
                  </button>
                </div>

                <div className="bg-zinc-950/60 border border-zinc-800 p-2.5 rounded-xl flex flex-col items-center gap-1.5">
                  <span className="text-[11px] text-zinc-300">Não respira?</span>
                  <button
                    type="button"
                    onClick={() => setPatientBreathing(!patientBreathing)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                      patientBreathing ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                    }`}
                  >
                    {patientBreathing ? 'NÃO' : 'SIM'}
                  </button>
                </div>

                <div className="bg-zinc-950/60 border border-zinc-800 p-2.5 rounded-xl flex flex-col items-center gap-1.5">
                  <span className="text-[11px] text-zinc-300">Dor no peito?</span>
                  <button
                    type="button"
                    onClick={() => setChestPain(!chestPain)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                      chestPain ? 'bg-red-600 text-white' : 'bg-zinc-700 text-zinc-200'
                    }`}
                  >
                    {chestPain ? 'SIM' : 'NÃO'}
                  </button>
                </div>
              </div>

              {/* Main Complaint Field */}
              <div className="mb-4">
                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Motivo / Sintomas
                </label>
                <input
                  type="text"
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  placeholder="Ex: Falta de ar, acidente de trânsito, dor no peito..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-600"
                />
              </div>

              {/* Expandable Extra Details (Name, Age) */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <span>{isExpanded ? '- Ocultar dados adicionais' : '+ Adicionar nome e idade da vítima'}</span>
                </button>

                {isExpanded && (
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-zinc-800">
                    <div className="col-span-2">
                      <input
                        type="text"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        placeholder="Nome do paciente"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        value={patientAge}
                        onChange={(e) => setPatientAge(e.target.value)}
                        placeholder="Idade"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Solid Authoritative Call Button */}
              <button
                type="button"
                onClick={handleRequestEmergency}
                className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Siren className="w-5 h-5" />
                <span>CHAMAR AMBULÂNCIA SAMU</span>
              </button>
            </div>
          )}

          {/* VIEW 2: SEARCHING STATE — Radar de despacho estilo Uber */}
          {activeCall && (activeCall.status === 'searching' || activeCall.status === 'offered') && (
            <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-5 shadow-2xl text-center">
              <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />

              {/* Radar sweep: escaneia viaturas próximas no raio geodésico */}
              <div className="relative w-36 h-36 mx-auto mb-3">
                <div className="absolute inset-0 rounded-full bg-red-950/30 border border-red-500/30" />
                <div className="absolute inset-4 rounded-full border border-red-500/20" />
                <div className="absolute inset-8 rounded-full border border-red-500/20" />
                <div
                  className="absolute inset-0 rounded-full animate-spin"
                  style={{
                    background: 'conic-gradient(from 0deg, rgba(225,29,72,0.55) 0deg, transparent 90deg)',
                    animationDuration: '1.6s',
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-red-600/20 border border-red-500/40 text-red-500 flex items-center justify-center">
                    <Radar className="w-6 h-6 animate-pulse" />
                  </div>
                </div>
                {nearbyAmbulances.slice(0, 5).map((amb, i) => {
                  const angle = (i / Math.max(1, Math.min(5, nearbyAmbulances.length))) * Math.PI * 2;
                  const r = 44 + (i % 2) * 12;
                  return (
                    <span
                      key={amb.id}
                      className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white/70 animate-pulse"
                      style={{
                        left: `calc(50% + ${Math.cos(angle) * r}px - 5px)`,
                        top: `calc(50% + ${Math.sin(angle) * r}px - 5px)`,
                      }}
                      title={amb.code}
                    />
                  );
                })}
              </div>

              <h3 className="text-base font-bold text-white mb-1">Localizando viatura mais próxima...</h3>
              <p className="text-xs text-zinc-400 mb-1 max-w-sm mx-auto leading-relaxed">
                A Central 192 está selecionando a viatura ideal (USA / USB / Moto) na sua região.
              </p>
              <p className="text-[11px] text-emerald-400 font-mono mb-4">
                {nearbyAmbulances.length > 0
                  ? `${nearbyAmbulances.length} viatura(s) no radar`
                  : 'Escaneando frota disponível...'}
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCprOpen(true)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <HeartPulse className="w-4 h-4 text-red-500" />
                  <span>Guia RCP</span>
                </button>

                <button
                  type="button"
                  onClick={handleCancelRequest}
                  className="px-4 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-xs font-semibold text-zinc-400 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* VIEW 3: ACTIVE RIDE IN PROGRESS (Uber Bottom Sheet) */}
          {activeCall &&
            ['dispatched', 'en_route_pickup', 'arrived_scene', 'transporting', 'arrived_hospital'].includes(activeCall.status) && (
              <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-5 shadow-2xl text-zinc-100">
                <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-3" />

                {/* Status Bar */}
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <div>
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      {getStatusText()}
                    </span>
                    <span className="text-[11px] text-zinc-400 block mt-0.5 font-mono">
                      Chamado #{activeCall.id.slice(0, 6)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-white tracking-tight">
                      {etaDisplay} min
                    </span>
                    <span className="text-[11px] text-zinc-400 block">
                      {distDisplay}
                    </span>
                  </div>
                </div>

                {/* Driver & Ambulance Info (Clean Uber Card) */}
                <div className="py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-red-500 font-bold text-sm">
                      <Ambulance className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {assignedAmbulance?.code || activeCall.ambulance_code || 'USA-01'}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {assignedAmbulance?.type || activeCall.ambulance_type || 'UTI Móvel'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {assignedAmbulance?.current_driver_name || activeCall.driver_name || 'Socorrista de Plantão'}
                      </p>
                    </div>
                  </div>

                  {/* License Plate Pill (MercoSul Style) */}
                  <div className="bg-white text-zinc-900 border border-zinc-300 rounded-lg px-2.5 py-1 text-center shadow-sm">
                    <span className="block text-[8px] font-black uppercase text-blue-700 tracking-wider">BRASIL</span>
                    <span className="block text-xs font-black font-mono tracking-tight">
                      {assignedAmbulance?.plate || activeCall.ambulance_plate || 'BRA-1901'}
                    </span>
                  </div>
                </div>

                {/* Quick Action Dock (Uber Style Buttons) */}
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-center">
                  <button
                    type="button"
                    onClick={() => setChatOpen(true)}
                    className="p-2.5 rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1"
                  >
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                    <span className="text-[10px] font-semibold">Mensagem</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="p-2.5 rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1"
                  >
                    <Share2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] font-semibold">{copyNotice ? 'Copiado!' : 'WhatsApp'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCprOpen(true)}
                    className="p-2.5 rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1"
                  >
                    <HeartPulse className="w-4 h-4 text-red-500" />
                    <span className="text-[10px] font-semibold">Guia RCP</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelRequest}
                    className="p-2.5 rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer flex flex-col items-center gap-1"
                  >
                    <X className="w-4 h-4 text-zinc-400" />
                    <span className="text-[10px] font-semibold">Cancelar</span>
                  </button>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* CPR Metronome Modal */}
      <CPRMetronomeModal isOpen={cprOpen} onClose={() => setCprOpen(false)} />

      {/* Realtime Chat Drawer */}
      {activeCall && (
        <ChatDrawer
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          callId={activeCall.id}
          currentUserId={citizenId}
          currentUserName={citizenName}
          currentUserRole="citizen"
          initialMessages={activeCall.messages || []}
        />
      )}
    </div>
  );
};
