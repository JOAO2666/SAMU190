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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-12">
      <SamuNavbar currentApp="central" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 w-full flex-1 flex flex-col">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ocorrências Ativas</span>
            <div className="text-2xl font-black text-white mt-1 flex items-center justify-between">
              <span>{calls.length}</span>
              <PhoneCall className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-[10px] text-red-400 mt-1">{criticalCallsCount} casos de alta gravidade</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Viaturas em Operação</span>
            <div className="text-2xl font-black text-white mt-1 flex items-center justify-between">
              <span>{busyCount}</span>
              <Ambulance className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Deslocando / Na cena</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Viaturas Prontas</span>
            <div className="text-2xl font-black text-emerald-400 mt-1 flex items-center justify-between">
              <span>{availableCount}</span>
              <CheckCircle className="w-5 h-5 text-emerald-500" />
            </div>
            <p className="text-[10px] text-emerald-400 mt-1">Disponíveis no radar</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hospitais & UPAs</span>
            <div className="text-2xl font-black text-blue-400 mt-1 flex items-center justify-between">
              <span>{hospitals.length}</span>
              <Building2 className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Rede de Retaguarda</p>
          </div>
        </div>

        {/* Main Work Area: Live Map & Queue Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
          {/* Left Column: Active Calls List */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                <h2 className="text-base font-black text-white">Fila de Regulação Médica</h2>
              </div>
              <button
                type="button"
                onClick={loadData}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Atualizar dados"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {calls.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-slate-500 text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
                  <p className="text-xs">Nenhum chamado ativo no momento.</p>
                  <p className="text-[11px] text-slate-600">Todas as ocorrências foram reguladas ou finalizadas.</p>
                </div>
              ) : (
                calls.map((call) => {
                  const isSelected = call.id === selectedCallId;
                  const severityBadge =
                    call.severity_color === 'Vermelho'
                      ? 'bg-red-500/20 text-red-400 border-red-500/30'
                      : call.severity_color === 'Laranja'
                      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                      : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';

                  return (
                    <div
                      key={call.id}
                      onClick={() => {
                        setSelectedCallId(call.id);
                        setCenterCoords([call.pickup_lat, call.pickup_lng]);
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-red-500 bg-slate-800/90 shadow-md ring-1 ring-red-500/50'
                          : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${severityBadge}`}>
                          {call.severity_color}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(call.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <h4 className="font-bold text-white text-sm leading-tight mb-1">{call.chief_complaint}</h4>
                      <p className="text-[11px] text-slate-400 leading-snug mb-2">
                        {call.patient_name || call.citizen_name} • {call.pickup_address}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-700/60 text-[10px]">
                        <span className="text-slate-400">
                          Viatura: <strong>{call.ambulance_code || 'Aguardando Despacho'}</strong>
                        </span>
                        <span className="font-bold text-amber-400 capitalize">{call.status}</span>
                      </div>

                      {/* Manual Dispatch Controls for Regulator */}
                      {call.status === 'searching' && (
                        <div className="mt-3 pt-2 border-t border-slate-700 flex items-center gap-2">
                          <select
                            value={manualAmbulanceId}
                            onChange={(e) => setManualAmbulanceId(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white flex-1"
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
                            className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
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
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col min-h-[480px]">
            <div className="flex items-center justify-between mb-3 px-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Mapa Operacional de Frota em Tempo Real
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {ambulances.length} Viaturas Rastreadas
              </span>
            </div>

            <div className="flex-1 rounded-2xl overflow-hidden border border-slate-800">
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
