import React, { useState, useEffect } from 'react';
import {
  Building2,
  Ambulance,
  PhoneCall,
  ShieldAlert,
  CheckCircle,
  Send,
  RefreshCw,
} from 'lucide-react';
import { SamuNavbar } from '../components/SamuNavbar';
import { LiveMap } from '../components/LiveMap';
import { getSamuSocket } from '../socket';
import { playBeep } from '../audio';
import type { EmergencyCall, Ambulance as AmbulanceType, HospitalUnit } from '../types';

export const DispatchCentralApp: React.FC = () => {
  const [calls, setCalls] = useState<EmergencyCall[]>([]);
  const [ambulances, setAmbulances] = useState<AmbulanceType[]>([]);
  const [hospitals, setHospitals] = useState<HospitalUnit[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [manualAmbulanceId, setManualAmbulanceId] = useState<string>('');
  const [centerCoords, setCenterCoords] = useState<[number, number]>([-9.3950, -40.5050]);

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

  // Compute KPIs
  const busyCount = ambulances.filter((a) => a.status === 'busy').length;
  const availableCount = ambulances.filter((a) => a.status === 'available').length;
  const criticalCallsCount = calls.filter((c) => ['Vermelho', 'Laranja'].includes(c.severity_color)).length;

  return (
    <div className="min-h-screen bg-[#050811] text-slate-100 flex flex-col font-sans pb-12 selection:bg-blue-500 selection:text-white">
      <SamuNavbar currentApp="central" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 w-full flex-1 flex flex-col">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Ocorrências Ativas</span>
            <div className="text-3xl font-black text-white mt-1.5 flex items-center justify-between">
              <span>{calls.length}</span>
              <div className="w-10 h-10 rounded-2xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-[#E11D48]">
                <PhoneCall className="w-5 h-5 animate-pulse" />
              </div>
            </div>
            <p className="text-[11px] text-rose-400 font-bold mt-2">{criticalCallsCount} casos prioritários</p>
          </div>

          <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Viaturas em Operação</span>
            <div className="text-3xl font-black text-white mt-1.5 flex items-center justify-between">
              <span>{busyCount}</span>
              <div className="w-10 h-10 rounded-2xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-500">
                <Ambulance className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 font-medium">Em deslocamento / cena</p>
          </div>

          <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Viaturas Prontas</span>
            <div className="text-3xl font-black text-emerald-400 mt-1.5 flex items-center justify-between">
              <span>{availableCount}</span>
              <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-emerald-400 mt-2 font-bold">Disponíveis no radar</p>
          </div>

          <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Hospitais & UPAs</span>
            <div className="text-3xl font-black text-sky-400 mt-1.5 flex items-center justify-between">
              <span>{hospitals.length}</span>
              <div className="w-10 h-10 rounded-2xl bg-sky-600/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Building2 className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 font-medium">Rede de Retaguarda</p>
          </div>
        </div>

        {/* Main Work Area: Live Map & Queue Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
          {/* Left Column: Active Calls List */}
          <div className="lg:col-span-5 bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-5 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[#E11D48]" />
                <h2 className="text-sm font-black text-white uppercase tracking-wider">Fila de Regulação Médica</h2>
              </div>
              <button
                type="button"
                onClick={loadData}
                className="p-2 rounded-xl bg-[#050811] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Atualizar dados"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[550px]">
              {calls.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center text-slate-500 text-center">
                  <CheckCircle className="w-10 h-10 text-emerald-500 mb-2.5 opacity-80" />
                  <p className="text-sm font-bold text-slate-300">Nenhum chamado pendente</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">Todas as ocorrências foram atendidas ou reguladas.</p>
                </div>
              ) : (
                calls.map((call) => {
                  const isSelected = call.id === selectedCallId;
                  const severityBadge =
                    call.severity_color === 'Vermelho'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : call.severity_color === 'Laranja'
                      ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40';

                  return (
                    <div
                      key={call.id}
                      onClick={() => {
                        setSelectedCallId(call.id);
                        setCenterCoords([call.pickup_lat, call.pickup_lng]);
                      }}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-rose-500 bg-slate-800/90 shadow-xl ring-2 ring-rose-500/40'
                          : 'border-slate-800/90 bg-[#050811]/60 hover:bg-slate-800/40 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${severityBadge}`}>
                          {call.severity_color}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(call.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <h4 className="font-extrabold text-white text-sm leading-tight mb-1">{call.chief_complaint}</h4>
                      <p className="text-xs text-slate-400 leading-snug mb-3">
                        {call.patient_name || call.citizen_name} • {call.pickup_address}
                      </p>

                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-800 text-[11px]">
                        <span className="text-slate-400">
                          Viatura: <strong className="text-white">{call.ambulance_code || 'Aguardando'}</strong>
                        </span>
                        <span className="font-black text-amber-400 uppercase text-[10px] bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-500/30">
                          {call.status}
                        </span>
                      </div>

                      {/* Manual Dispatch Controls for Regulator */}
                      {call.status === 'searching' && (
                        <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-2">
                          <select
                            value={manualAmbulanceId}
                            onChange={(e) => setManualAmbulanceId(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#050811] border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white flex-1 font-medium"
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
          <div className="lg:col-span-7 bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-4 shadow-2xl flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-3 px-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping shadow-[0_0_8px_#3b82f6]" />
                <span className="text-xs font-black text-white uppercase tracking-wider">
                  Mapa Operacional de Frota em Tempo Real
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono bg-[#050811] px-2.5 py-1 rounded-full border border-slate-800">
                {ambulances.length} Viaturas Ativas
              </span>
            </div>

            <div className="flex-1 rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
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
      </main>
    </div>
  );
};
