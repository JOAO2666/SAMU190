import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Siren,
  Ambulance,
  Building2,
  Wifi,
  WifiOff,
  ChevronRight,
  HeartPulse,
} from 'lucide-react';
import { getSamuSocket } from '../socket';

interface SamuNavbarProps {
  currentApp: 'citizen' | 'driver' | 'central';
}

export const SamuNavbar: React.FC<SamuNavbarProps> = ({ currentApp }) => {
  const [connected, setConnected] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const socket = getSamuSocket();
    setConnected(socket.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <header className="bg-[#050811]/90 backdrop-blur-xl border-b border-slate-800/80 text-white sticky top-0 z-50 shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/samu')}
              className="flex items-center gap-2 group text-left cursor-pointer"
              title="Voltar ao Hub SAMU 190"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E11D48] to-[#9F1239] flex items-center justify-center text-white shadow-lg shadow-rose-900/40 group-hover:scale-105 transition-transform border border-rose-500/40">
                <Siren className="w-5 h-5 animate-pulse text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-xl tracking-wider text-[#E11D48]">SAMU</span>
                  <span className="font-black text-xl text-white">190</span>
                  <span className="text-[9px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 ml-1">
                    LIVE
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium tracking-wide">Despacho Pré-Hospitalar</p>
              </div>
            </button>
          </div>

          {/* App Switcher Tabs (Desktop) */}
          <nav className="hidden md:flex items-center gap-1 bg-[#0F172A]/90 p-1 rounded-2xl border border-slate-800/90 text-xs font-semibold shadow-inner">
            <NavLink
              to="/samu/cidadao"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all duration-200 ${
                  isActive || currentApp === 'citizen'
                    ? 'bg-[#E11D48] text-white shadow-lg shadow-rose-900/50 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`
              }
            >
              <HeartPulse className="w-3.5 h-3.5" />
              <span>App Cidadão</span>
            </NavLink>

            <NavLink
              to="/samu/socorrista"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all duration-200 ${
                  isActive || currentApp === 'driver'
                    ? 'bg-[#F97316] text-white shadow-lg shadow-orange-900/50 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`
              }
            >
              <Ambulance className="w-3.5 h-3.5" />
              <span>App Socorrista</span>
            </NavLink>

            <NavLink
              to="/samu/central"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all duration-200 ${
                  isActive || currentApp === 'central'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`
              }
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Central 192</span>
            </NavLink>
          </nav>

          {/* Right Status & Quick Profile */}
          <div className="flex items-center gap-2.5">
            {/* Socket Status Pill */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border backdrop-blur-md ${
                connected
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-950/40 text-rose-400 border-rose-500/30'
              }`}
              title={connected ? 'Conexão WebSocket ativa' : 'Desconectado do servidor'}
            >
              {connected ? <Wifi className="w-3.5 h-3.5 animate-pulse text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-rose-400" />}
              <span className="hidden sm:inline">{connected ? 'Satélite Online' : 'Offline'}</span>
            </div>

            {/* Back to SaudeConnect SUS */}
            <button
              onClick={() => navigate('/app')}
              className="text-xs text-slate-300 hover:text-white bg-[#0F172A] hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer font-medium"
              title="Ir para o Portal de Consultas SUS"
            >
              <span className="hidden sm:inline">Portal SUS</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Strip */}
        <div className="md:hidden flex items-center justify-around py-2 border-t border-slate-800/60 bg-[#050811]/95 text-[11px] font-semibold">
          <NavLink
            to="/samu/cidadao"
            className={({ isActive }) =>
              `flex items-center gap-1 py-1 px-2.5 rounded-lg ${
                isActive || currentApp === 'citizen' ? 'bg-[#E11D48] text-white font-bold' : 'text-slate-400'
              }`
            }
          >
            <HeartPulse className="w-3.5 h-3.5" />
            <span>Cidadão</span>
          </NavLink>
          <NavLink
            to="/samu/socorrista"
            className={({ isActive }) =>
              `flex items-center gap-1 py-1 px-2.5 rounded-lg ${
                isActive || currentApp === 'driver' ? 'bg-[#F97316] text-white font-bold' : 'text-slate-400'
              }`
            }
          >
            <Ambulance className="w-3.5 h-3.5" />
            <span>Socorrista</span>
          </NavLink>
          <NavLink
            to="/samu/central"
            className={({ isActive }) =>
              `flex items-center gap-1 py-1 px-2.5 rounded-lg ${
                isActive || currentApp === 'central' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400'
              }`
            }
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Central 192</span>
          </NavLink>
        </div>
      </div>
    </header>
  );
};
