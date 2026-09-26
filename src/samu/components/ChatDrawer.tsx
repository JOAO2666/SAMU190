import React, { useState, useEffect, useRef } from 'react';
import { Send, X, MessageSquare, ShieldCheck } from 'lucide-react';
import { getSamuSocket } from '../socket';
import { playBeep } from '../audio';
import type { EmergencyMessage } from '../types';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: 'citizen' | 'driver' | 'doctor';
  initialMessages?: EmergencyMessage[];
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  callId,
  currentUserId,
  currentUserName,
  currentUserRole,
  initialMessages = [],
}) => {
  const [messages, setMessages] = useState<EmergencyMessage[]>(initialMessages);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const socket = getSamuSocket();

    const handleNewMessage = (msg: EmergencyMessage) => {
      if (msg.emergency_call_id === callId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (msg.sender_id !== currentUserId) {
          playBeep(950, 100);
        }
      }
    };

    socket.on('incident:new_message', handleNewMessage);
    return () => {
      socket.off('incident:new_message', handleNewMessage);
    };
  }, [callId, currentUserId]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const sendMessage = (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const socket = getSamuSocket();
    socket.emit('incident:send_message', {
      callId,
      senderId: currentUserId,
      senderName: currentUserName,
      senderRole: currentUserRole,
      message: text,
    });

    setInputText('');
  };

  const quickPresets =
    currentUserRole === 'citizen'
      ? ['O portão está aberto', 'Estamos na calçada aguardando', 'Vítima está desacordada', 'Casa com muro verde']
      : ['Estamos a 2 minutos do local', 'Mantenha o portão livre', 'Não mova a vítima', 'Estamos na sua rua com a sirene'];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#050811]/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md bg-[#0F172A] border-l border-slate-800/90 h-full flex flex-col shadow-2xl text-white">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/90 flex items-center justify-between bg-[#050811]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-[#E11D48] shadow-inner">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">Canal de Comunicação Direto</h3>
              <p className="text-[11px] text-slate-400 font-medium">Equipe de Resgate & Central SAMU</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Presets Chips */}
        <div className="p-2.5 bg-[#050811]/40 border-b border-slate-800/80 flex gap-2 overflow-x-auto text-[11px]">
          {quickPresets.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => sendMessage(preset)}
              className="px-3 py-1.5 rounded-full bg-[#0F172A] hover:bg-slate-800 text-slate-300 hover:text-white whitespace-nowrap border border-slate-800 transition-colors shrink-0 font-medium cursor-pointer"
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Messages Feed */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center px-4">
              <ShieldCheck className="w-10 h-10 text-slate-600 mb-2 stroke-1" />
              <p className="text-xs font-bold text-slate-300">Canal criptografado da ocorrência aberto.</p>
              <p className="text-[11px] text-slate-500 mt-1">Envie detalhes de pontos de referência ou estado do paciente.</p>
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.sender_id === currentUserId;
              return (
                <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[10px] text-slate-400 font-semibold">{m.sender_name}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase font-bold ${
                        m.sender_role === 'driver'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : m.sender_role === 'doctor'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {m.sender_role === 'driver' ? 'Socorrista' : m.sender_role === 'doctor' ? 'Médico' : 'Solicitante'}
                    </span>
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed font-medium ${
                      isMine
                        ? 'bg-gradient-to-r from-[#E11D48] to-rose-600 text-white rounded-tr-none shadow-md shadow-rose-950'
                        : 'bg-[#050811] text-slate-100 rounded-tl-none border border-slate-800'
                    }`}
                  >
                    {m.message}
                  </div>
                  <span className="text-[9px] text-slate-500 mt-0.5 px-1 font-mono">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="p-3 border-t border-slate-800 bg-[#050811]/90 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Mensagem rápida para a equipe..."
            className="flex-1 bg-[#050811] border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-2xl bg-gradient-to-r from-[#E11D48] to-rose-600 hover:from-rose-500 hover:to-red-600 disabled:opacity-40 disabled:hover:from-[#E11D48] text-white transition-all shadow-md shadow-rose-950 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
