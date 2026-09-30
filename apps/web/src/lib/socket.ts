'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 800,
  });

  socket.on('job:new', (payload: { jobId: string }) => {
    window.dispatchEvent(new CustomEvent('wl:job:new', { detail: payload }));
  });
  socket.on('notification:new', (payload: unknown) => {
    window.dispatchEvent(new CustomEvent('wl:notification:new', { detail: payload }));
  });
  socket.on('message:new', (payload: unknown) => {
    window.dispatchEvent(new CustomEvent('wl:message:new', { detail: payload }));
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}
