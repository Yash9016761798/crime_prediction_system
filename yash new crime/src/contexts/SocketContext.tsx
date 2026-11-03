/**
 * Crime Intel — Socket.IO client context.
 *
 * Provides a single, authenticated Socket.IO connection shared across the
 * React application. The connection is authenticated with the existing JWT
 * access token from the Redux auth state.
 *
 * Usage:
 *   const { socket, isConnected, emit } = useSocket();
 *   socket.on('sos:new', handler);
 */

import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAppSelector } from '../store/hooks';

const SOCKET_URL =
  (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/api$/, '') ||
  'http://localhost:5000';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, payload?: any, callback?: (res: any) => void) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler?: (...args: any[]) => void) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const accessToken = useAppSelector((state: any) => state.auth?.accessToken);
  const isAuthenticated = useAppSelector((state: any) => state.auth?.isAuthenticated);

  const socketRef = useRef<Socket | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const connect = useCallback(() => {
    if (socketRef.current?.connected || socketRef.current?.disconnected === false) return;
    if (!accessToken) return;

    const socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      setSocketInstance(socket);
      console.log('[socket.io] connected');
    });

    socket.on('disconnect', (_reason: string) => {
      setIsConnected(false);
      setSocketInstance(null);
      console.log('[socket.io] disconnected:', _reason);
    });

    socket.on('connect_error', (_err: Error) => {
      setIsConnected(false);
      setSocketInstance(null);
      console.error('[socket.io] connect error:', _err.message);
    });

    socketRef.current = socket;
  }, [accessToken]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
    setSocketInstance(null);
  }, []);

  // (Re)connect when authentication state changes.
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      connect();
    } else {
      const id = setTimeout(() => disconnect(), 0);
      return () => clearTimeout(id);
    }
  }, [isAuthenticated, accessToken, connect, disconnect]);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const emit = useCallback((event: string, payload?: any, callback?: (res: any) => void) => {
    const socket = socketRef.current;
    if (!socket) {
      console.warn(`[socket.io] not connected, cannot emit ${event}`);
      if (callback) callback({ ok: false, error: 'Socket not connected' });
      return;
    }
    socket.emit(event, payload, (res: any) => {
      if (callback) callback(res ?? { ok: true });
    });
  }, []);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, []);

  const off = useCallback((event: string, handler?: (...args: any[]) => void) => {
    const socket = socketRef.current;
    if (!socket) return;
    if (handler) socket.off(event, handler);
    else socket.removeAllListeners(event);
  }, []);

  const value: SocketContextType = {
    socket: socketInstance,
    isConnected,
    connect,
    disconnect,
    emit,
    on,
    off,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
