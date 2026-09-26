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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl text-white">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Canal de Comunicação Direto</h3>
              <p className="text-[11px] text-slate-400">Equipe de Resgate & Central SAMU</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Presets Chips */}
        <div className="p-2.5 bg-slate-950/40 border-b border-slate-800 flex gap-1.5 overflow-x-auto text-[11px]">
          {quickPresets.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => sendMessage(preset)}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white whitespace-nowrap border border-slate-700/80 transition-colors shrink-0"
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
              <p className="text-xs">Canal criptografado da ocorrência aberto.</p>
              <p className="text-[11px] text-slate-600 mt-1">Envie detalhes de pontos de referência ou estado do paciente.</p>
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.sender_id === currentUserId;
              return (
                <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[10px] text-slate-400 font-semibold">{m.sender_name}</span>
                    <span
                      className={`text-[9px] px-1 rounded uppercase font-bold ${
                        m.sender_role === 'driver'
                          ? 'bg-amber-500/20 text-amber-300'
                          : m.sender_role === 'doctor'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {m.sender_role === 'driver' ? 'Socorrista' : m.sender_role === 'doctor' ? 'Médico' : 'Solicitante'}
                    </span>
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      isMine
                        ? 'bg-red-600 text-white rounded-tr-none shadow-md shadow-red-900/20'
                        : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                    }`}
                  >
                    {m.message}
                  </div>
                  <span className="text-[9px] text-slate-500 mt-0.5 px-1">
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
          className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Mensagem rápida para a equipe..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
