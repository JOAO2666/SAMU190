import React, { useState, useEffect } from 'react';
import {
  Building2,
  Ambulance,
  PhoneCall,
  ShieldAlert,
  CheckCircle,
  Send,
  RefreshCw,
  BedDouble,
  FileText,
  MessageSquare,
} from 'lucide-react';
import { SamuNavbar } from '../components/SamuNavbar';
import { LiveMap } from '../components/LiveMap';
import { getSamuSocket } from '../socket';
import { playBeep } from '../audio';
import type { EmergencyCall, Ambulance as AmbulanceType, HospitalUnit, BaphRecord, EmergencyMessage } from '../types';

// Fila priorizada pelo Protocolo de Manchester (spec §4): Vermelho > Laranja > Amarelo > Verde > Azul
const MANCHESTER_ORDER: Record<string, number> = {
  Vermelho: 1,
  Laranja: 2,
  Amarelo: 3,
  Verde: 4,
  Azul: 5,
};

function manchesterRank(color?: string): number {
  return MANCHESTER_ORDER[color || ''] || 6;
}

export const DispatchCentralApp: React.FC = () => {
  const [calls, setCalls] = useState<EmergencyCall[]>([]);
  const [ambulances, setAmbulances] = useState<AmbulanceType[]>([]);
  const [hospitals, setHospitals] = useState<HospitalUnit[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [manualAmbulanceId, setManualAmbulanceId] = useState<string>('');
  const [centerCoords, setCenterCoords] = useState<[number, number]>([-9.3950, -40.5050]);
  const [selectedDetails, setSelectedDetails] = useState<{ messages: EmergencyMessage[]; baph: BaphRecord | null } | null>(null);

  const loadData = () => {
    fetch('/api/samu/calls/active')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCalls(data);
      })
      .catch(() => {});

    fetch('/api/samu/ambulances')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAmbulances(data);
          if (data.length > 0 && !manualAmbulanceId) setManualAmbulanceId(data[0].id);
        }
      })
      .catch(() => {});

    fetch('/api/samu/hospitals')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setHospitals(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadData();

    const socket = getSamuSocket();
    socket.emit('central:join');

    const onNewCall = (call: EmergencyCall) => {
      setCalls((prev) => [call, ...prev.filter((c) => c.id !== call.id)]);
      playBeep(1200, 250);
    };

    const onCallUpdated = (call: EmergencyCall) => {
      setCalls((prev) => {
        if (call.status === 'completed' || call.status === 'cancelled') {
          return prev.filter((c) => c.id !== call.id);
        }
        const index = prev.findIndex((c) => c.id === call.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = call;
          return updated;
        }
        return [call, ...prev];
      });
    };

    const onAmbulanceTelemetry = (data: any) => {
      setAmbulances((prev) =>
        prev.map((a) =>
          a.id === data.ambulanceId
            ? { ...a, current_lat: data.lat, current_lng: data.lng, current_heading: data.heading, speed: data.speed }
            : a
        )
      );
    };

    const onAmbulanceUpdated = (amb: AmbulanceType) => {
      setAmbulances((prev) => prev.map((a) => (a.id === amb.id ? amb : a)));
    };

    socket.on('call:new', onNewCall);
    socket.on('call:updated', onCallUpdated);
    socket.on('ambulance:telemetry', onAmbulanceTelemetry);
    socket.on('ambulance:updated', onAmbulanceUpdated);

    return () => {
      socket.off('call:new', onNewCall);
      socket.off('call:updated', onCallUpdated);
      socket.off('ambulance:telemetry', onAmbulanceTelemetry);
      socket.off('ambulance:updated', onAmbulanceUpdated);
    };
  }, []);

  const handleManualDispatch = (callId: string) => {
    if (!manualAmbulanceId) return;
    const socket = getSamuSocket();
    socket.emit('central:manual_dispatch', {
      callId,
      ambulanceId: manualAmbulanceId,
    });
  };

  const selectedCall = calls.find((c) => c.id === selectedCallId);

  // Fila ordenada por criticidade Manchester + recência (spec §4 App 3)
  const sortedCalls = [...calls].sort((a, b) => {
    const rank = manchesterRank(a.severity_color) - manchesterRank(b.severity_color);
    if (rank !== 0) return rank;
    return Date.parse(b.requested_at) - Date.parse(a.requested_at);
  });

  // Detalhes da ocorrência selecionada (chat + BAPH) para o Médico Regulador
  useEffect(() => {
    if (!selectedCallId) {
      setSelectedDetails(null);
      return;
    }
    fetch(`/api/samu/calls/${encodeURIComponent(selectedCallId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setSelectedDetails({ messages: data.messages || [], baph: data.baph || null });
      })
      .catch(() => {});
  }, [selectedCallId]);

  // BAPH ao vivo via socket
  useEffect(() => {
    const socket = getSamuSocket();
    const onBaph = (baph: BaphRecord) => {
      if (selectedCall && baph.emergency_call_id === selectedCall.id) {
        setSelectedDetails((prev) => ({ messages: prev?.messages || [], baph }));
      }
    };
    const onIncidentMsg = (msg: EmergencyMessage) => {
      if (selectedCall && msg.emergency_call_id === selectedCall.id) {
        setSelectedDetails((prev) => ({
          messages: [...(prev?.messages || []), msg],
          baph: prev?.baph || null,
        }));
      }
    };
    socket.on('baph:updated', onBaph);
    socket.on('incident:new_message', onIncidentMsg);
    socket.on('incident:message', onIncidentMsg);
    return () => {
      socket.off('baph:updated', onBaph);
      socket.off('incident:new_message', onIncidentMsg);
      socket.off('incident:message', onIncidentMsg);
    };
  }, [selectedCall?.id]);

  // Compute KPIs
  const busyCount = ambulances.filter((a) => a.status === 'busy').length;
  const availableCount = ambulances.filter((a) => a.status === 'available').length;
  const criticalCallsCount = calls.filter((c) => ['Vermelho', 'Laranja'].includes(c.severity_color)).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans pb-12 selection:bg-blue-500 selection:text-white">
      <SamuNavbar currentApp="central" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 w-full flex-1 flex flex-col">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/90 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Ocorrências Ativas</span>
            <div className="text-3xl font-black text-white mt-1.5 flex items-center justify-between">
              <span>{calls.length}</span>
              <div className="w-10 h-10 rounded-2xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-[#E11D48]">
                <PhoneCall className="w-5 h-5 animate-pulse" />
              </div>
            </div>
            <p className="text-[11px] text-rose-400 font-bold mt-2">{criticalCallsCount} casos prioritários</p>
          </div>

          <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/90 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Viaturas em Operação</span>
            <div className="text-3xl font-black text-white mt-1.5 flex items-center justify-between">
              <span>{busyCount}</span>
              <div className="w-10 h-10 rounded-2xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-500">
                <Ambulance className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 font-medium">Em deslocamento / cena</p>
          </div>

          <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/90 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Viaturas Prontas</span>
            <div className="text-3xl font-black text-emerald-400 mt-1.5 flex items-center justify-between">
              <span>{availableCount}</span>
              <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-emerald-400 mt-2 font-bold">Disponíveis no radar</p>
          </div>

          <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/90 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Hospitais & UPAs</span>
            <div className="text-3xl font-black text-sky-400 mt-1.5 flex items-center justify-between">
              <span>{hospitals.length}</span>
              <div className="w-10 h-10 rounded-2xl bg-sky-600/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Building2 className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 font-medium">Rede de Retaguarda</p>
          </div>
        </div>

        {/* Main Work Area: Live Map & Queue Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
          {/* Left Column: Active Calls List */}
          <div className="lg:col-span-5 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/90 rounded-3xl p-5 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[#E11D48]" />
                <h2 className="text-sm font-black text-white uppercase tracking-wider">Fila de Regulação Médica</h2>
              </div>
              <button
                type="button"
                onClick={loadData}
                className="p-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Atualizar dados"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[550px]">
              {sortedCalls.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center text-zinc-500 text-center">
                  <CheckCircle className="w-10 h-10 text-emerald-500 mb-2.5 opacity-80" />
                  <p className="text-sm font-bold text-zinc-300">Nenhum chamado pendente</p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xs">Todas as ocorrências foram atendidas ou reguladas.</p>
                </div>
              ) : (
                sortedCalls.map((call) => {
                  const isSelected = call.id === selectedCallId;
                  const severityBadge =
                    call.severity_color === 'Vermelho'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : call.severity_color === 'Laranja'
                      ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                      : call.severity_color === 'Amarelo'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : call.severity_color === 'Verde'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-sky-500/20 text-sky-300 border-sky-500/40';

                  return (
                    <div
                      key={call.id}
                      onClick={() => {
                        setSelectedCallId(call.id);
                        setCenterCoords([call.pickup_lat, call.pickup_lng]);
                      }}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-rose-500 bg-zinc-800/90 shadow-xl ring-2 ring-rose-500/40'
                          : 'border-zinc-800/90 bg-zinc-950/60 hover:bg-zinc-800/40 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${severityBadge}`}>
                          {call.severity_color}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {new Date(call.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <h4 className="font-extrabold text-white text-sm leading-tight mb-1">{call.chief_complaint}</h4>
                      <p className="text-xs text-zinc-400 leading-snug mb-3">
                        {call.patient_name || call.citizen_name} • {call.pickup_address}
                      </p>

                      <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800 text-[11px]">
                        <span className="text-zinc-400">
                          Viatura: <strong className="text-white">{call.ambulance_code || 'Aguardando'}</strong>
                        </span>
                        <span className="font-black text-amber-400 uppercase text-[10px] bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-500/30">
                          {call.status}
                        </span>
                      </div>

                      {/* Manual Dispatch Controls for Regulator */}
                      {call.status === 'searching' && (
                        <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-2">
                          <select
                            value={manualAmbulanceId}
                            onChange={(e) => setManualAmbulanceId(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-white flex-1 font-medium"
                          >
                            {ambulances
                              .filter((a) => a.status === 'available')
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} ({a.type})
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleManualDispatch(call.id);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#9F1239] hover:from-rose-500 hover:to-rose-700 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-rose-950"
                          >
                            <Send className="w-3 h-3" />
                            <span>Despachar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Fleet Command Map */}
          <div className="lg:col-span-7 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/90 rounded-3xl p-4 shadow-2xl flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-3 px-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping shadow-[0_0_8px_#3b82f6]" />
                <span className="text-xs font-black text-white uppercase tracking-wider">
                  Mapa Operacional de Frota em Tempo Real
                </span>
              </div>
              <span className="text-xs text-zinc-400 font-mono bg-zinc-950 px-2.5 py-1 rounded-full border border-zinc-800">
                {ambulances.length} Viaturas Ativas
              </span>
            </div>

            <div className="flex-1 rounded-2xl overflow-hidden border border-zinc-800 shadow-inner">
              <LiveMap
                center={centerCoords}
                zoom={14}
                ambulances={ambulances}
                hospitals={hospitals}
                citizenPos={selectedCall ? [selectedCall.pickup_lat, selectedCall.pickup_lng] : undefined}
                citizenAddress={selectedCall?.pickup_address}
                activeAmbulanceId={selectedCall?.ambulance_id || undefined}
              />
            </div>
          </div>
        </div>

        {/* Telemetria de leitos + detalhes da ocorrência (spec §4 App 3) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
          {/* Bed telemetry */}
          <div className="lg:col-span-5 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/90 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center gap-2 mb-4 px-1">
              <BedDouble className="w-5 h-5 text-sky-400" />
              <h2 className="text-sm font-black text-white uppercase tracking-wider">Leitos de Emergência — Rede SUS</h2>
            </div>
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {hospitals.map((h) => {
                const total = h.totalBeds ?? h.total_beds ?? 20;
                const avail = h.availableBeds ?? h.available_beds ?? h.emergencyBeds ?? 5;
                const pct = total > 0 ? Math.round((avail / total) * 100) : 0;
                const barColor = pct > 30 ? 'bg-emerald-500' : pct > 10 ? 'bg-amber-500' : 'bg-rose-500';
                return (
                  <div key={h.id} className="p-3 rounded-2xl border border-zinc-800/90 bg-zinc-950/60">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-xs text-white truncate">{h.name}</strong>
                      <span className="text-[11px] font-mono text-zinc-300 shrink-0">{avail}/{total} livres</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 mt-2 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    {(h.specialties && h.specialties.length > 0) && (
                      <p className="text-[10px] text-zinc-400 mt-1.5">{h.specialties.slice(0, 4).join(' · ')}</p>
                    )}
                  </div>
                );
              })}
              {!hospitals.length && <p className="text-xs text-zinc-500">Nenhuma unidade encontrada.</p>}
            </div>
          </div>

          {/* Selected incident details: BAPH + chat */}
          <div className="lg:col-span-7 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/90 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center gap-2 mb-4 px-1">
              <FileText className="w-5 h-5 text-rose-400" />
              <h2 className="text-sm font-black text-white uppercase tracking-wider">
                {selectedCall ? `Ocorrência #${selectedCall.id.slice(0, 6)} — ${selectedCall.chief_complaint}` : 'Detalhes da ocorrência'}
              </h2>
            </div>
            {!selectedCall ? (
              <p className="text-xs text-zinc-500">Selecione um chamado na fila para ver BAPH e mensagens em tempo real.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-2xl border border-zinc-800/90 bg-zinc-950/60">
                  <h3 className="text-[11px] font-black text-zinc-300 uppercase tracking-wider mb-2">BAPH Digital</h3>
                  {!selectedDetails?.baph ? (
                    <p className="text-xs text-zinc-500">Aguardando preenchimento pela equipe em trânsito.</p>
                  ) : (
                    <dl className="text-xs text-zinc-300 space-y-1 font-mono">
                      <div className="flex justify-between"><dt>Glasgow</dt><dd className="text-white font-bold">{selectedDetails.baph.glasgow_score ?? '--'}/15</dd></div>
                      <div className="flex justify-between"><dt>PA</dt><dd className="text-white font-bold">{selectedDetails.baph.systolic_bp ?? '--'}/{selectedDetails.baph.diastolic_bp ?? '--'}</dd></div>
                      <div className="flex justify-between"><dt>FC</dt><dd className="text-white font-bold">{selectedDetails.baph.heart_rate ?? '--'} bpm</dd></div>
                      <div className="flex justify-between"><dt>SpO2</dt><dd className="text-white font-bold">{selectedDetails.baph.oxygen_saturation ?? selectedDetails.baph.o2_sat ?? '--'}%</dd></div>
                      <div className="flex justify-between"><dt>FR</dt><dd className="text-white font-bold">{selectedDetails.baph.respiratory_rate ?? '--'} irpm</dd></div>
                      {(selectedDetails.baph.observations || selectedDetails.baph.notes) && (
                        <p className="text-[11px] text-zinc-400 pt-1 font-sans">{selectedDetails.baph.observations || selectedDetails.baph.notes}</p>
                      )}
                    </dl>
                  )}
                </div>
                <div className="p-3 rounded-2xl border border-zinc-800/90 bg-zinc-950/60">
                  <h3 className="text-[11px] font-black text-zinc-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-sky-400" /> Chat da ocorrência
                  </h3>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto">
                    {(selectedDetails?.messages || []).map((m) => (
                      <div key={m.id} className="text-xs">
                        <span className="text-zinc-400 font-semibold">{m.sender_name}: </span>
                        <span className="text-zinc-100">{m.message || m.text}</span>
                      </div>
                    ))}
                    {!(selectedDetails?.messages || []).length && (
                      <p className="text-xs text-zinc-500">Nenhuma mensagem trocada ainda.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
