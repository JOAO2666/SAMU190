import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ambulance,
  HeartPulse,
  Building2,
  Navigation,
  Activity,
  ArrowRight,
  Smartphone,
  Radio,
  Zap,
} from 'lucide-react';
import { SamuNavbar } from '../components/SamuNavbar';

export const SamuLanding: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <SamuNavbar currentApp="citizen" />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider mb-6">
          <Zap className="w-4 h-4" />
          <span>Plataforma Dual-App de Resgate em Tempo Real</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight max-w-4xl mx-auto">
          O <span className="text-red-500 underline decoration-red-600/50">Uber das Ambulâncias</span> para Atendimento Pré-Hospitalar
        </h1>

        <p className="mt-5 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Ecossistema completo com dois aplicativos sincronizados via WebSockets: um para o cidadão acionar socorro imediato com telemetria ao vivo, e outro para o condutor socorrista com sirene de despacho e navegação curva a curva.
        </p>

        {/* 3 Main App Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 text-left">
          {/* Card 1: Citizen App */}
          <div className="bg-slate-900 border border-slate-800 hover:border-red-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl transition-all hover:scale-[1.02] flex flex-col justify-between group">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500 mb-6 group-hover:scale-110 transition-transform">
                <HeartPulse className="w-8 h-8" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400">APP 1</span>
                <h3 className="text-xl font-black text-white">SAMU 190 Cidadão</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Botão SOS em 1 toque, geolocalização automática por GPS, triagem Manchester rápida, radar de viatura mais próxima, mapa de trajeto em tempo real e guia com metrônomo sonoro de RCP a 110 BPM.
              </p>
            </div>

            <button
              onClick={() => navigate('/samu/cidadao')}
              className="w-full py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
            >
              <span>Abrir App do Cidadão</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 2: Driver App */}
          <div className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl transition-all hover:scale-[1.02] flex flex-col justify-between group">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-6 group-hover:scale-110 transition-transform">
                <Ambulance className="w-8 h-8" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">APP 2</span>
                <h3 className="text-xl font-black text-white">SAMU 190 Socorrista</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Controle de plantão Online/Offline, seleção de viatura (USA / USB / Motolância), alerta com sirene de emergência e contagem de 20s para aceite, navegação turn-by-turn e BAPH digital em trânsito.
              </p>
            </div>

            <button
              onClick={() => navigate('/samu/socorrista')}
              className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-600/30 transition-all cursor-pointer"
            >
              <span>Abrir App do Socorrista</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 3: Central Dispatch */}
          <div className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl transition-all hover:scale-[1.02] flex flex-col justify-between group">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-6 group-hover:scale-110 transition-transform">
                <Building2 className="w-8 h-8" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">DESKTOP</span>
                <h3 className="text-xl font-black text-white">Central de Regulação 192</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Painel do Médico Regulador para monitorar toda a frota no mapa em tempo real, fila de ocorrências por criticidade Manchester, despacho manual de viaturas e gestão de vagas hospitalares.
              </p>
            </div>

            <button
              onClick={() => navigate('/samu/central')}
              className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
            >
              <span>Abrir Central de Regulação</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="bg-slate-900/60 border-t border-b border-slate-800 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex items-start gap-3">
            <Radio className="w-6 h-6 text-red-500 shrink-0 mt-1" />
            <div>
              <h4 className="font-bold text-white text-sm">Latência Sub-segundo</h4>
              <p className="text-xs text-slate-400 mt-0.5">Comunicação contínua bidirecional via WebSockets/Socket.io.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Navigation className="w-6 h-6 text-amber-500 shrink-0 mt-1" />
            <div>
              <h4 className="font-bold text-white text-sm">Rastreamento OSRM</h4>
              <p className="text-xs text-slate-400 mt-0.5">Rotas viárias reais com previsão exata de tempo de chegada (ETA).</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Activity className="w-6 h-6 text-emerald-500 shrink-0 mt-1" />
            <div>
              <h4 className="font-bold text-white text-sm">Protocolo Manchester</h4>
              <p className="text-xs text-slate-400 mt-0.5">Priorização médica automática de viaturas de suporte avançado (USA).</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Smartphone className="w-6 h-6 text-blue-500 shrink-0 mt-1" />
            <div>
              <h4 className="font-bold text-white text-sm">Pronto para Android</h4>
              <p className="text-xs text-slate-400 mt-0.5">Configurado com Capacitor para geração de APK nativo de produção.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
