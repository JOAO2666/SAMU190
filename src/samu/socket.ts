import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function getSamuSocket(): Socket {
  if (!socketInstance) {
    // When running Vite dev server (port 5173), API is at port 3001
    const socketUrl =
      window.location.port === '5173'
        ? `http://${window.location.hostname}:3001`
        : window.location.origin;

    socketInstance = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('[SAMU Socket] Conectado ao servidor:', socketInstance?.id);
    });

    socketInstance.on('connect_error', (error) => {
      console.warn('[SAMU Socket] Erro de conexão:', error.message);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[SAMU Socket] Desconectado:', reason);
    });
  }

  return socketInstance;
}
