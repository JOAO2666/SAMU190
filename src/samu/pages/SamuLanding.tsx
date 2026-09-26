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
    <div className="min-h-screen bg-[#050811] text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      <SamuNavbar currentApp="citizen" />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-black uppercase tracking-wider mb-6">
          <Zap className="w-4 h-4 text-[#E11D48]" />
          <span>Plataforma Dual-App de Resgate em Tempo Real</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight max-w-4xl mx-auto">
          O <span className="text-[#E11D48] underline decoration-rose-500/40">Uber das Ambulâncias</span> para Atendimento Pré-Hospitalar
        </h1>

        <p className="mt-5 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
          Ecossistema completo com dois aplicativos sincronizados via WebSockets: um para o cidadão acionar socorro imediato com telemetria ao vivo, e outro para o condutor socorrista com sirene de despacho e navegação curva a curva.
        </p>

        {/* 3 Main App Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 text-left">
          {/* Card 1: Citizen App */}
          <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 hover:border-rose-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between group">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-[#E11D48] mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-rose-950">
                <HeartPulse className="w-8 h-8" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">APP 1</span>
                <h3 className="text-xl font-black text-white">SAMU 190 Cidadão</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Botão SOS em 1 toque, geolocalização automática por GPS, triagem Manchester rápida, radar de viatura mais próxima, mapa de trajeto em tempo real e guia com metrônomo sonoro de RCP a 110 BPM.
              </p>
            </div>

            <button
              onClick={() => navigate('/samu/cidadao')}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#E11D48] to-rose-600 hover:from-rose-500 hover:to-red-600 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-rose-900/40 transition-all cursor-pointer"
            >
              <span>Abrir App do Cidadão</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 2: Driver App */}
          <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 hover:border-amber-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between group">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-amber-950">
                <Ambulance className="w-8 h-8" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">APP 2</span>
                <h3 className="text-xl font-black text-white">SAMU 190 Socorrista</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Controle de plantão Online/Offline, seleção de viatura (USA / USB / Motolância), alerta com sirene de emergência e contagem de 20s para aceite, navegação turn-by-turn e BAPH digital em trânsito.
              </p>
            </div>

            <button
              onClick={() => navigate('/samu/socorrista')}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-amber-900/40 transition-all cursor-pointer"
            >
              <span>Abrir App do Socorrista</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 3: Central Dispatch */}
          <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800/90 hover:border-blue-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between group">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-blue-950">
                <Building2 className="w-8 h-8" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">DESKTOP</span>
                <h3 className="text-xl font-black text-white">Central de Regulação 192</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Painel do Médico Regulador para monitorar toda a frota no mapa em tempo real, fila de ocorrências por criticidade Manchester, despacho manual de viaturas e gestão de vagas hospitalares.
              </p>
            </div>

            <button
              onClick={() => navigate('/samu/central')}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-blue-900/40 transition-all cursor-pointer"
            >
              <span>Abrir Central de Regulação</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="bg-[#0F172A]/50 border-t border-b border-slate-800/80 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-[#E11D48] shrink-0 mt-0.5">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Latência Sub-segundo</h4>
              <p className="text-xs text-slate-400 mt-0.5">Comunicação contínua bidirecional via WebSockets/Socket.io.</p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Rastreamento OSRM</h4>
              <p className="text-xs text-slate-400 mt-0.5">Rotas viárias reais com previsão exata de tempo de chegada (ETA).</p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Protocolo Manchester</h4>
              <p className="text-xs text-slate-400 mt-0.5">Priorização médica automática de viaturas de suporte avançado (USA).</p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
              <Smartphone className="w-5 h-5" />
            </div>
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
