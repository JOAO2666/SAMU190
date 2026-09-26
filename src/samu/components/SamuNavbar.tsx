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
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/samu')}
              className="flex items-center gap-2 group text-left cursor-pointer"
              title="Voltar ao Hub SAMU 190"
            >
              <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-red-500/30 shadow-md group-hover:scale-105 transition-transform">
                <Siren className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-xl tracking-wider text-red-500">SAMU</span>
                  <span className="font-extrabold text-xl text-white">190</span>
                  <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-red-600/30 text-red-400 border border-red-500/40 ml-1">
                    REALTIME
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">Despacho Móvel de Emergência</p>
              </div>
            </button>
          </div>

          {/* Quick App Switcher Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs font-semibold">
            <NavLink
              to="/samu/cidadao"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  isActive || currentApp === 'citizen'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`
              }
            >
              <HeartPulse className="w-3.5 h-3.5" />
              <span>App Cidadão</span>
            </NavLink>

            <NavLink
              to="/samu/socorrista"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  isActive || currentApp === 'driver'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`
              }
            >
              <Ambulance className="w-3.5 h-3.5" />
              <span>App Socorrista</span>
            </NavLink>

            <NavLink
              to="/samu/central"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  isActive || currentApp === 'central'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`
              }
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Central 192</span>
            </NavLink>
          </nav>

          {/* Right Status & Quick Profile */}
          <div className="flex items-center gap-3">
            {/* Socket Status Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                connected
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40'
                  : 'bg-rose-950/60 text-rose-400 border-rose-500/40'
              }`}
              title={connected ? 'Conexão WebSocket ativa' : 'Desconectado do servidor'}
            >
              {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{connected ? 'GPS Online' : 'Sem Conexão'}</span>
            </div>

            {/* Back to SaudeConnect SUS */}
            <button
              onClick={() => navigate('/app')}
              className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              title="Ir para o Portal de Consultas SUS"
            >
              <span className="hidden sm:inline">Portal SUS</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
