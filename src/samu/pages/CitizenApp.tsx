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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-12">
      <SamuNavbar currentApp="citizen" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 w-full flex-1 flex flex-col">
        {/* VIEW 1: IDLE / SOS BUTTON & QUICK TRIAGE */}
        {!activeCall && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Big SOS & Triage Card */}
            <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

              {/* Title & Urgent Badge */}
              <div className="flex items-center justify-between gap-3 mb-6">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
                    Chamada de Emergência SAMU 190
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Pedir Ambulância</h1>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
                  <Siren className="w-7 h-7 animate-pulse" />
                </div>
              </div>

              {/* Detected Location Card */}
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-red-600/30 text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Local do Resgate (GPS)</span>
                      {isLocating && <span className="text-[10px] text-amber-400 animate-pulse">Obtendo GPS...</span>}
                    </div>
                    <p className="text-sm font-semibold text-white mt-0.5 leading-snug">{address}</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Coordenadas: {userPos[0].toFixed(5)}, {userPos[1].toFixed(5)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Manchester Severity Selector */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Classificação da Urgência (Protocolo de Manchester)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { color: 'Vermelho', label: 'Emergência (Imediata)', border: 'border-red-500', bg: 'bg-red-600', text: 'text-red-400' },
                    { color: 'Laranja', label: 'Muito Urgente (10m)', border: 'border-orange-500', bg: 'bg-orange-600', text: 'text-orange-400' },
                    { color: 'Amarelo', label: 'Urgente (60m)', border: 'border-yellow-500', bg: 'bg-yellow-600', text: 'text-yellow-400' },
                    { color: 'Verde', label: 'Pouco Urgente', border: 'border-emerald-500', bg: 'bg-emerald-600', text: 'text-emerald-400' },
                  ].map((item) => (
                    <button
                      key={item.color}
                      type="button"
                      onClick={() => setSeverityColor(item.color as any)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        severityColor === item.color
                          ? `${item.border} bg-slate-800 ring-2 ring-red-500/50`
                          : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-3 h-3 rounded-full ${item.bg}`} />
                        <span className="text-xs font-bold text-white">{item.color}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block leading-tight">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Questions (Conscious & Breathing) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <div className="bg-slate-800/40 border border-slate-700/60 p-3.5 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Vítima Consciente?</span>
                    <span className="text-[11px] text-slate-400">Responde a estímulos verbais</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPatientConscious(!patientConscious)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      patientConscious ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                    }`}
                  >
                    {patientConscious ? 'SIM' : 'NÃO'}
                  </button>
                </div>

                <div className="bg-slate-800/40 border border-slate-700/60 p-3.5 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Está Respirando?</span>
                    <span className="text-[11px] text-slate-400">Tórax subindo e descendo</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPatientBreathing(!patientBreathing)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      patientBreathing ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
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
                  placeholder="Ex: Parada cardíaca, acidente de moto, falta de ar..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Big Red SOS Button */}
              <button
                type="button"
                onClick={handleRequestEmergency}
                className="w-full py-5 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-600 text-white font-black text-lg tracking-wider uppercase flex items-center justify-center gap-3 shadow-xl shadow-red-600/40 hover:shadow-red-600/60 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
              >
                <Siren className="w-6 h-6 animate-spin" />
                <span>CHAMAR AMBULÂNCIA SAMU 190</span>
              </button>
            </div>

            {/* Right: Map Preview & Emergency Advice */}
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-red-500" />
                  <span>Sua Localização no Radar SAMU</span>
                </h3>
                <div className="h-[280px] rounded-2xl overflow-hidden border border-slate-800">
                  <LiveMap center={userPos} zoom={15} citizenPos={userPos} citizenAddress={address} hospitals={hospitals} />
                </div>
              </div>

              {/* First Aid Teaser */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500">
                    <HeartPulse className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base">Guia de Primeiros Socorros</h4>
                    <p className="text-xs text-slate-400">Instruções de Massagem Cardíaca e Metrônomo RCP</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCprOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white border border-slate-700 transition-colors cursor-pointer"
                >
                  Abrir Guia
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: SEARCHING RADAR (Uber-style finding nearest driver) */}
        {activeCall && (activeCall.status === 'searching' || activeCall.status === 'offered') && (
          <div className="max-w-2xl mx-auto w-full text-center py-10">
            <div className="relative flex items-center justify-center w-48 h-48 mx-auto mb-8">
              <div className="absolute inset-0 rounded-full border-4 border-red-500/20 animate-ping" />
              <div className="absolute inset-4 rounded-full border-2 border-red-500/40 animate-pulse" />
              <div className="w-24 h-24 rounded-full bg-red-600 shadow-2xl shadow-red-600/60 flex items-center justify-center text-white">
                <Ambulance className="w-12 h-12 animate-bounce" />
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">Buscando Viatura Mais Próxima...</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
              Nossa Central de Regulação Médica está contatando as equipes de plantão (USA / USB / Motolância) na sua região.
            </p>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 mb-8">
              <Clock className="w-4 h-4 text-red-500 animate-spin" />
              <span>Tempo médio de aceite do socorrista: 15 segundos</span>
            </div>

            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={() => setCprOpen(true)}
                className="px-6 py-3 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                <HeartPulse className="w-4 h-4" />
                <span>Instruções de Primeiros Socorros</span>
              </button>

              <button
                type="button"
                onClick={handleCancelRequest}
                className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 font-bold text-xs transition-colors cursor-pointer"
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
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-[11px] font-extrabold uppercase px-3 py-1 rounded-full border ${statusBadge?.color}`}>
                      {statusBadge?.label}
                    </span>
                    <span className="text-xs font-mono text-slate-400">ID: {activeCall.id.slice(0, 8)}</span>
                  </div>

                  {/* Big ETA */}
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                      {activeCall.eta_minutes || 4}
                    </span>
                    <span className="text-lg font-bold text-red-500 uppercase">minutos</span>
                    <span className="text-xs text-slate-400 ml-auto">
                      {activeCall.distance_km ? `${activeCall.distance_km.toFixed(1)} km de distância` : 'Aproximando-se'}
                    </span>
                  </div>

                  {/* Ambulance & Driver Details Card */}
                  <div className="bg-slate-800/60 border border-slate-700/70 rounded-2xl p-4 flex items-center justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-600/30">
                        <Ambulance className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-white text-base">
                            {assignedAmbulance?.code || activeCall.ambulance_code || 'USA-01'}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                            {assignedAmbulance?.type || activeCall.ambulance_type || 'UTI Móvel'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium">
                          {assignedAmbulance?.current_driver_name || activeCall.driver_name || 'Socorrista de Plantão'}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Placa: {assignedAmbulance?.plate || activeCall.ambulance_plate || 'BRA-1901'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-ping mr-1.5" />
                      <span className="text-[11px] font-bold text-emerald-400">Sirene Ligada</span>
                    </div>
                  </div>

                  {/* Action Buttons: Chat, Share, First Aid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setChatOpen(true)}
                      className="py-3 px-4 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Mensagem Direta</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      className="py-3 px-4 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>{copyNotice ? 'Link Copiado!' : 'WhatsApp Rastreio'}</span>
                    </button>
                  </div>

                  {/* CPR Metronome Full Width Button */}
                  <button
                    type="button"
                    onClick={() => setCprOpen(true)}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
                  >
                    <HeartPulse className="w-4 h-4 animate-pulse" />
                    <span>Abrir Guia de Primeiros Socorros & Ritmo RCP</span>
                  </button>
                </div>

                {/* Patient Summary Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-xs text-slate-300">
                  <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block mb-2">Dados da Vítima</span>
                  <div className="flex items-center justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Paciente:</span>
                    <strong className="text-white">{activeCall.patient_name || citizenName}</strong>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Queixa:</span>
                    <strong className="text-white">{activeCall.chief_complaint}</strong>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-400">Prioridade:</span>
                    <strong className="text-red-400">{activeCall.severity_color}</strong>
                  </div>
                </div>
              </div>

              {/* Right Column: Full-Height Live Interactive Map */}
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl flex flex-col min-h-[480px]">
                <div className="flex items-center justify-between mb-3 px-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Telemetria ao Vivo do Trajeto</span>
                  </div>
                  <span className="text-[11px] text-slate-400">Atualização a cada 2s</span>
                </div>

                <div className="flex-1 rounded-2xl overflow-hidden border border-slate-800">
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
