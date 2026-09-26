import React, { useState, useEffect } from 'react';
import { HeartPulse, Play, Square, X, AlertOctagon, ShieldAlert } from 'lucide-react';
import { startCPRMetronome, stopCPRMetronome } from '../audio';

interface CPRMetronomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CPRMetronomeModal: React.FC<CPRMetronomeModalProps> = ({ isOpen, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [beatCount, setBeatCount] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);
  const [tab, setTab] = useState<'rcp' | 'hemorragia' | 'engasgo'>('rcp');

  useEffect(() => {
    return () => {
      stopCPRMetronome();
    };
  }, []);

  if (!isOpen) return null;

  const toggleMetronome = () => {
    if (isPlaying) {
      stopCPRMetronome();
      setIsPlaying(false);
      setBeatCount(0);
    } else {
      setIsPlaying(true);
      startCPRMetronome((count) => {
        setBeatCount(count);
        setIsPulsing(true);
        setTimeout(() => setIsPulsing(false), 150);
      });
    }
  };

  const currentCycle = Math.floor(beatCount / 30) + 1;
  const currentCompression = beatCount % 30 || (beatCount > 0 ? 30 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-white flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500">
              <HeartPulse className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Guia de Primeiros Socorros</h3>
              <p className="text-[11px] text-slate-400">Instruções enquanto a viatura se desloca</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCPRMetronome();
              setIsPlaying(false);
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 text-xs font-semibold bg-slate-950/30">
          <button
            onClick={() => setTab('rcp')}
            className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
              tab === 'rcp' ? 'border-red-500 text-red-400 bg-red-500/10' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Parada Cardíaca (RCP)
          </button>
          <button
            onClick={() => setTab('hemorragia')}
            className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
              tab === 'hemorragia' ? 'border-red-500 text-red-400 bg-red-500/10' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Hemorragia Severa
          </button>
          <button
            onClick={() => setTab('engasgo')}
            className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
              tab === 'engasgo' ? 'border-red-500 text-red-400 bg-red-500/10' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Engasgo (Heimlich)
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {tab === 'rcp' && (
            <>
              {/* Metronome Box */}
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-center relative overflow-hidden">
                <div className="flex items-center justify-center gap-6">
                  {/* Pulsing Visual Heart */}
                  <div
                    className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-150 ${
                      isPulsing
                        ? 'bg-red-600 scale-110 shadow-lg shadow-red-500/50 text-white'
                        : 'bg-red-950/60 border-2 border-red-500/40 text-red-400 scale-100'
                    }`}
                  >
                    <HeartPulse className="w-10 h-10" />
                  </div>

                  {/* Beats and Cycle info */}
                  <div className="text-left">
                    <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider block">
                      Ritmo Padronizado (110 BPM)
                    </span>
                    <div className="text-2xl font-black text-white mt-0.5">
                      {isPlaying ? `${currentCompression} / 30` : '-- / 30'}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Ciclo Atual: <strong className="text-white">{isPlaying ? currentCycle : 1}</strong>
                    </p>
                  </div>
                </div>

                {/* Control Button */}
                <button
                  onClick={toggleMetronome}
                  className={`mt-4 w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isPlaying
                      ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Square className="w-4 h-4 fill-white" />
                      <span>Pausar Metrônomo Sonoro</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      <span>Iniciar Ritmo da Massagem (110 BPM)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Step by step */}
              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="flex items-start gap-2.5 bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50">
                  <span className="w-5 h-5 rounded-full bg-red-600/30 text-red-400 font-black flex items-center justify-center shrink-0">1</span>
                  <p>Deite a vítima de costas em uma <strong>superfície rígida e plana</strong> (no chão, não na cama).</p>
                </div>

                <div className="flex items-start gap-2.5 bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50">
                  <span className="w-5 h-5 rounded-full bg-red-600/30 text-red-400 font-black flex items-center justify-center shrink-0">2</span>
                  <p>Ajoelhe-se ao lado dela, posicione as <strong>mãos entrelaçadas no centro do peito</strong> (sobre o osso esterno).</p>
                </div>

                <div className="flex items-start gap-2.5 bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50">
                  <span className="w-5 h-5 rounded-full bg-red-600/30 text-red-400 font-black flex items-center justify-center shrink-0">3</span>
                  <p>Mantenha os <strong>braços esticados</strong>, use o peso do seu tronco e afunde o tórax em <strong>pelo menos 5 cm</strong> no ritmo do metrônomo.</p>
                </div>

                <div className="flex items-start gap-2.5 bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50">
                  <span className="w-5 h-5 rounded-full bg-red-600/30 text-red-400 font-black flex items-center justify-center shrink-0">4</span>
                  <p><strong>Não pare!</strong> Se houver outra pessoa no local, revezem a cada 2 minutos (5 ciclos) para evitar exaustão até a ambulância chegar.</p>
                </div>
              </div>
            </>
          )}

          {tab === 'hemorragia' && (
            <div className="space-y-3 text-xs text-slate-300">
              <div className="bg-red-950/40 border border-red-500/40 p-3 rounded-xl flex items-center gap-3">
                <AlertOctagon className="w-8 h-8 text-red-400 shrink-0" />
                <p className="text-red-200">
                  A contenção rápida de sangramentos severos evita choque hipovolêmico e salva vidas em minutos.
                </p>
              </div>

              <div className="space-y-2">
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                  <h4 className="font-bold text-white text-sm mb-1">1. Pressão Direta Forte</h4>
                  <p>Pegue um pano limpo, toalha ou gaze e pressione diretamente sobre o ferimento com toda a força das suas mãos.</p>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                  <h4 className="font-bold text-white text-sm mb-1">2. Não retire o pano ensopado</h4>
                  <p>Se o sangue atravessar o pano, coloque outro por cima sem retirar o primeiro para não romper os coágulos já formados.</p>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                  <h4 className="font-bold text-white text-sm mb-1">3. Mantenha a vítima deitada e aquecida</h4>
                  <p>Cubra a vítima com um cobertor ou casaco para prevenir hipotermia enquanto aguardam a equipe médica.</p>
                </div>
              </div>
            </div>
          )}

          {tab === 'engasgo' && (
            <div className="space-y-3 text-xs text-slate-300">
              <div className="bg-amber-950/40 border border-amber-500/40 p-3 rounded-xl flex items-center gap-3">
                <ShieldAlert className="w-8 h-8 text-amber-400 shrink-0" />
                <p className="text-amber-200">
                  Se a vítima não consegue falar, tossir ou respirar e leva as mãos à garganta, aja imediatamente.
                </p>
              </div>

              <div className="space-y-2">
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                  <h4 className="font-bold text-white text-sm mb-1">Adulto Consciente: Manobra de Heimlich</h4>
                  <p>Fique atrás da pessoa. Posicione um punho fechado acima do umbigo dela. Com a outra mão por cima, puxe com força para dentro e para cima (em formato de "J") repetidas vezes.</p>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                  <h4 className="font-bold text-white text-sm mb-1">Bebê (Menor de 1 ano)</h4>
                  <p>Deite o bebê de bruços sobre o seu antebraço com a cabeça mais baixa. Aplique 5 golpes firmes entre as escápulas com o calcanhar da mão. Vire de frente e faça 5 compressões no peito.</p>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                  <h4 className="font-bold text-white text-sm mb-1">Se a vítima desmaiar:</h4>
                  <p>Deite-a no chão imediatamente e inicie a Massagem Cardíaca (RCP) na aba ao lado.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Suporte Pré-Hospitalar SAMU 190</span>
          <button
            onClick={() => {
              stopCPRMetronome();
              setIsPlaying(false);
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors"
          >
            Fechar Guia
          </button>
        </div>
      </div>
    </div>
  );
};
