import React, { useState, useEffect } from 'react';
import {
  Siren,
  MapPin,
  HeartPulse,
  MessageSquare,
  Share2,
  Clock,
  Ambulance,
  Compass,
} from 'lucide-react';
import { SamuNavbar } from '../components/SamuNavbar';
import { LiveMap } from '../components/LiveMap';
import { CPRMetronomeModal } from '../components/CPRMetronomeModal';
import { ChatDrawer } from '../components/ChatDrawer';
import { getSamuSocket } from '../socket';
import { playAcceptSound, playBeep } from '../audio';
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

  // Triage inputs
  const [chiefComplaint, setChiefComplaint] = useState('Dor torácica intensa com falta de ar');
  const [severityColor, setSeverityColor] = useState<'Vermelho' | 'Laranja' | 'Amarelo' | 'Verde'>('Vermelho');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientConscious, setPatientConscious] = useState(true);
  const [patientBreathing, setPatientBreathing] = useState(true);

  // App States: 'IDLE' | 'SEARCHING' | 'IN_PROGRESS' | 'COMPLETED'
  const [activeCall, setActiveCall] = useState<EmergencyCall | null>(null);
  const [assignedAmbulance, setAssignedAmbulance] = useState<AmbulanceType | null>(null);
  const [hospitals, setHospitals] = useState<HospitalUnit[]>([]);

  // Modals
  const [cprOpen, setCprOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [copyNotice, setCopyNotice] = useState(false);

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
    };

    const onCallAccepted = ({ call, ambulance }: { call: EmergencyCall; ambulance: AmbulanceType }) => {
      setActiveCall(call);
      setAssignedAmbulance(ambulance);
      playAcceptSound();
    };

    const onStatusChanged = (call: EmergencyCall) => {
      setActiveCall(call);
      playBeep(880, 200);
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
    socket.on('ambulance:telemetry', onTelemetry);

    return () => {
      socket.off('call:created', onCallCreated);
      socket.off('call:accepted', onCallAccepted);
      socket.off('call:status_changed', onStatusChanged);
      socket.off('ambulance:telemetry', onTelemetry);
    };
  }, [citizenId, activeCall?.id]);

  // Request Emergency Button Action
  const handleRequestEmergency = () => {
    const socket = getSamuSocket();
    socket.emit('citizen:request_emergency', {
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
    });
  };

  // Cancel Request Action
  const handleCancelRequest = () => {
    if (!activeCall) return;
    const socket = getSamuSocket();
    socket.emit('driver:advance_status', {
      callId: activeCall.id,
      nextStatus: 'cancelled',
      cancellationReason: 'Cancelado pelo solicitante',
    });
    setActiveCall(null);
    setAssignedAmbulance(null);
  };

  // Share Live Ride WhatsApp
  const handleShareWhatsApp = () => {
    const shareUrl = `${window.location.origin}/samu/cidadao?call=${activeCall?.id || ''}`;
    const text = encodeURIComponent(
      `🚨 *SAMU 190 - Acompanhamento de Resgate em Tempo Real*\nUma ambulância foi solicitada para ${address}.\nAcompanhe a aproximação pelo link: ${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    setCopyNotice(true);
    setTimeout(() => setCopyNotice(false), 3000);
  };

  // Route points if active
  const routePoints: [number, number][] = [];
  if (userPos && userPos[0]) {
    routePoints.push(userPos);
  }
  if (assignedAmbulance?.current_lat && assignedAmbulance?.current_lng) {
    routePoints.unshift([assignedAmbulance.current_lat, assignedAmbulance.current_lng]);
  }

  // Pre-calculated or live status descriptions
  const getStatusBadge = () => {
    if (!activeCall) return null;
    switch (activeCall.status) {
      case 'searching':
        return { label: 'Buscando Viatura Mais Próxima...', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' };
      case 'offered':
        return { label: 'Viatura Localizada - Enviando Alerta...', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' };
      case 'dispatched':
      case 'en_route_pickup':
        return { label: 'Ambulância Deslocando-se até Você', color: 'bg-red-500/20 text-red-400 border-red-500/40' };
      case 'arrived_scene':
        return { label: 'Viatura no Local da Ocorrência', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
      case 'transporting':
        return { label: 'Paciente a Bordo - A Caminho do Hospital', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' };
      case 'arrived_hospital':
        return { label: 'Chegada ao Hospital / Pronto-Socorro', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40' };
      case 'completed':
        return { label: 'Atendimento Concluído', color: 'bg-slate-700 text-slate-300 border-slate-600' };
      default:
        return { label: 'Solicitado', color: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="min-h-screen bg-[#050811] text-slate-100 flex flex-col font-sans pb-12 selection:bg-rose-500 selection:text-white">
      <SamuNavbar currentApp="citizen" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 w-full flex-1 flex flex-col">
        {/* VIEW 1: IDLE / SOS BUTTON & QUICK TRIAGE */}
        {!activeCall && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Big SOS & Triage Card */}
            <div className="lg:col-span-6 bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

              {/* Title & Urgent Badge */}
              <div className="flex items-center justify-between gap-3 mb-6">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#E11D48] bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/30">
                    Chamada de Emergência SAMU 190
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-black text-white mt-2 tracking-tight">Pedir Ambulância</h1>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#E11D48] to-[#9F1239] border border-rose-500/40 flex items-center justify-center text-white shrink-0 shadow-lg shadow-rose-900/40">
                  <Siren className="w-7 h-7 animate-pulse text-white" />
                </div>
              </div>

              {/* Detected Location Card */}
              <div className="bg-[#050811]/70 border border-slate-800/90 rounded-2xl p-4 mb-6 shadow-inner">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Local do Resgate (GPS)</span>
                      {isLocating && <span className="text-[10px] text-amber-400 animate-pulse font-mono">Obtendo GPS...</span>}
                    </div>
                    <p className="text-sm font-bold text-white mt-0.5 leading-snug">{address}</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">
                      Coordenadas: {userPos[0].toFixed(5)}, {userPos[1].toFixed(5)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Manchester Severity Selector */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
                  Classificação da Urgência (Protocolo de Manchester)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { color: 'Vermelho', label: 'Emergência (Imediata)', border: 'border-rose-500', bg: 'bg-[#E11D48]', text: 'text-rose-400' },
                    { color: 'Laranja', label: 'Muito Urgente (10m)', border: 'border-orange-500', bg: 'bg-[#F97316]', text: 'text-orange-400' },
                    { color: 'Amarelo', label: 'Urgente (60m)', border: 'border-amber-500', bg: 'bg-[#F59E0B]', text: 'text-amber-400' },
                    { color: 'Verde', label: 'Pouco Urgente', border: 'border-emerald-500', bg: 'bg-[#10B981]', text: 'text-emerald-400' },
                  ].map((item) => (
                    <button
                      key={item.color}
                      type="button"
                      onClick={() => setSeverityColor(item.color as any)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        severityColor === item.color
                          ? `${item.border} bg-slate-800/90 ring-2 ring-rose-500/50 shadow-lg`
                          : 'border-slate-800 bg-[#050811]/40 hover:bg-slate-800/40 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${item.bg}`} />
                        <span className="text-xs font-black text-white">{item.color}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block leading-tight font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Questions (Conscious & Breathing) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <div className="bg-[#050811]/50 border border-slate-800/80 p-3.5 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Vítima Consciente?</span>
                    <span className="text-[11px] text-slate-400">Responde a estímulos verbais</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPatientConscious(!patientConscious)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md ${
                      patientConscious ? 'bg-emerald-600 text-white shadow-emerald-900/40' : 'bg-[#E11D48] text-white shadow-rose-900/40'
                    }`}
                  >
                    {patientConscious ? 'SIM' : 'NÃO'}
                  </button>
                </div>

                <div className="bg-[#050811]/50 border border-slate-800/80 p-3.5 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Está Respirando?</span>
                    <span className="text-[11px] text-slate-400">Tórax subindo e descendo</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPatientBreathing(!patientBreathing)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md ${
                      patientBreathing ? 'bg-emerald-600 text-white shadow-emerald-900/40' : 'bg-[#E11D48] text-white shadow-rose-900/40'
                    }`}
                  >
                    {patientBreathing ? 'SIM' : 'NÃO'}
                  </button>
                </div>
              </div>

              {/* Patient Name & Age (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Nome da Vítima (Opcional)
                  </label>
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Ex: Nome da pessoa que precisa de socorro"
                    className="w-full bg-[#050811] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Idade Aprox.
                  </label>
                  <input
                    type="number"
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    placeholder="Ex: 45"
                    className="w-full bg-[#050811] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
              </div>

              {/* Chief Complaint Input */}
              <div className="mb-8">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Motivo Principal / Sintomas
                </label>
                <input
                  type="text"
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  placeholder="Ex: Parada cardíaca, acidente de moto, dor no peito..."
                  className="w-full bg-[#050811] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-500 transition-colors font-medium"
                />
              </div>

              {/* Big Red SOS Button with Pulse & Glow */}
              <button
                type="button"
                onClick={handleRequestEmergency}
                className="w-full py-5 rounded-2xl bg-gradient-to-r from-[#E11D48] via-rose-600 to-[#BE123C] hover:from-rose-500 hover:to-red-600 text-white font-black text-lg tracking-wider uppercase flex items-center justify-center gap-3 shadow-2xl shadow-rose-900/60 glow-crimson-btn hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
              >
                <Siren className="w-6 h-6 animate-spin text-white" />
                <span>CHAMAR AMBULÂNCIA SAMU 190</span>
              </button>
            </div>

            {/* Right: Map Preview & Emergency Advice */}
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                    <Compass className="w-4 h-4 text-[#E11D48]" />
                    <span>Radar Georreferenciado SAMU</span>
                  </h3>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Sinal Forte
                  </span>
                </div>
                <div className="h-[300px] rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
                  <LiveMap center={userPos} zoom={15} citizenPos={userPos} citizenAddress={address} hospitals={hospitals} />
                </div>
              </div>

              {/* First Aid Teaser */}
              <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-6 shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                    <HeartPulse className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-white text-base">Guia de Primeiros Socorros</h4>
                    <p className="text-xs text-slate-400">Massagem cardíaca e metrônomo sonoro RCP a 110 BPM</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCprOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white border border-slate-700 transition-colors cursor-pointer shrink-0"
                >
                  Abrir Guia
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: SEARCHING RADAR (Uber-style concentric radar circles) */}
        {activeCall && (activeCall.status === 'searching' || activeCall.status === 'offered') && (
          <div className="max-w-2xl mx-auto w-full text-center py-12">
            {/* Concentric Radar Animation */}
            <div className="relative flex items-center justify-center w-60 h-60 mx-auto mb-8">
              {/* Outer Radar Wave 2 */}
              <div className="absolute inset-0 rounded-full border border-rose-500/30 animate-radar-2" />
              {/* Mid Radar Wave 1 */}
              <div className="absolute inset-4 rounded-full border-2 border-rose-500/40 animate-radar-1" />
              {/* Core Pulsing Center */}
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#E11D48] to-[#9F1239] shadow-2xl shadow-rose-900/80 flex items-center justify-center text-white border-2 border-rose-400/50 glow-crimson-btn">
                <Ambulance className="w-12 h-12 animate-pulse text-white" />
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2 tracking-tight">
              Buscando Viatura Mais Próxima...
            </h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto mb-6 leading-relaxed">
              Nossa Central de Regulação Médica está contatando as viaturas de prontidão na sua área com menor tempo de resposta.
            </p>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0F172A] border border-slate-800 text-xs text-slate-300 mb-8 font-medium">
              <Clock className="w-4 h-4 text-[#E11D48] animate-spin" />
              <span>Tempo estimado de aceite: ~15 segundos</span>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setCprOpen(true)}
                className="px-6 py-3 rounded-2xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <HeartPulse className="w-4 h-4" />
                <span>Instruções de Primeiros Socorros</span>
              </button>

              <button
                type="button"
                onClick={handleCancelRequest}
                className="px-6 py-3 rounded-2xl bg-[#0F172A] hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar Chamado
              </button>
            </div>
          </div>
        )}

        {/* VIEW 3: ACTIVE RIDE IN PROGRESS (Uber-like moving ambulance & ETA) */}
        {activeCall &&
          ['dispatched', 'en_route_pickup', 'arrived_scene', 'transporting', 'arrived_hospital'].includes(activeCall.status) && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
              {/* Left Column: Live Ride Card & Controls */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                {/* Main ETA Card */}
                <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-[11px] font-black uppercase px-3 py-1 rounded-full border ${statusBadge?.color}`}>
                      {statusBadge?.label}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 bg-[#050811] px-2 py-0.5 rounded-lg border border-slate-800">
                      ID: {activeCall.id.slice(0, 8)}
                    </span>
                  </div>

                  {/* Big ETA */}
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-5xl sm:text-6xl font-black text-white tracking-tight">
                      {activeCall.eta_minutes || 4}
                    </span>
                    <span className="text-xl font-black text-[#E11D48] uppercase tracking-wide">min</span>
                    <span className="text-xs text-slate-400 ml-auto font-mono">
                      {activeCall.distance_km ? `${activeCall.distance_km.toFixed(1)} km de distância` : 'Aproximando-se'}
                    </span>
                  </div>

                  {/* Ambulance & Driver Details Card */}
                  <div className="bg-[#050811]/70 border border-slate-800/90 rounded-2xl p-4 flex items-center justify-between gap-4 mb-5 shadow-inner">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#E11D48] to-[#9F1239] flex items-center justify-center text-white shadow-lg shadow-rose-900/40 border border-rose-500/30 shrink-0">
                        <Ambulance className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white text-base">
                            {assignedAmbulance?.code || activeCall.ambulance_code || 'USA-01'}
                          </span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            {assignedAmbulance?.type || activeCall.ambulance_type || 'UTI Móvel'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-semibold mt-0.5">
                          {assignedAmbulance?.current_driver_name || activeCall.driver_name || 'Socorrista de Plantão'}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          Placa: {assignedAmbulance?.plate || activeCall.ambulance_plate || 'BRA-1901'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block animate-ping mr-1.5 shadow-[0_0_8px_#34d399]" />
                      <span className="text-[11px] font-bold text-emerald-400">Sirene Ativa</span>
                    </div>
                  </div>

                  {/* Action Buttons: Chat, Share, First Aid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setChatOpen(true)}
                      className="py-3 px-4 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                    >
                      <MessageSquare className="w-4 h-4 text-blue-400" />
                      <span>Mensagem Direta</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      className="py-3 px-4 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                    >
                      <Share2 className="w-4 h-4 text-emerald-400" />
                      <span>{copyNotice ? 'Link Copiado!' : 'WhatsApp Rastreio'}</span>
                    </button>
                  </div>

                  {/* CPR Metronome Full Width Button */}
                  <button
                    type="button"
                    onClick={() => setCprOpen(true)}
                    className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-[#E11D48] to-rose-600 hover:from-rose-500 hover:to-red-600 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-rose-900/50 transition-all cursor-pointer"
                  >
                    <HeartPulse className="w-4 h-4 animate-pulse" />
                    <span>Guia de Primeiros Socorros & Ritmo RCP (110 BPM)</span>
                  </button>
                </div>

                {/* Patient Summary Card */}
                <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-5 text-xs text-slate-300 shadow-xl">
                  <span className="font-black text-slate-400 uppercase tracking-wider text-[10px] block mb-2.5">Dados da Ocorrência</span>
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Paciente:</span>
                    <strong className="text-white font-bold">{activeCall.patient_name || citizenName}</strong>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Queixa:</span>
                    <strong className="text-white font-bold">{activeCall.chief_complaint}</strong>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-slate-400">Gravidade:</span>
                    <span className="text-rose-400 font-black px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">{activeCall.severity_color}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Full-Height Live Interactive Map */}
              <div className="lg:col-span-7 bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-4 shadow-2xl flex flex-col min-h-[500px]">
                <div className="flex items-center justify-between mb-3 px-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#E11D48] animate-ping shadow-[0_0_8px_#E11D48]" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">Telemetria ao Vivo do Trajeto</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">GPS atualizado a cada 2s</span>
                </div>

                <div className="flex-1 rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
                  <LiveMap
                    center={userPos}
                    zoom={15}
                    citizenPos={userPos}
                    citizenAddress={address}
                    ambulances={assignedAmbulance ? [assignedAmbulance] : []}
                    hospitals={hospitals}
                    routeCoords={routePoints}
                    activeAmbulanceId={assignedAmbulance?.id}
                  />
                </div>
              </div>
            </div>
          )}
      </main>

      {/* First Aid & CPR Metronome Modal */}
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
