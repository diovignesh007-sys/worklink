import { Server as SocketServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { verifyAccessToken } from '../lib/tokens.js';

/**
 * Realtime events (§8): message:new, message:read, typing, notification:new,
 * job:new. Socket auth uses the short-lived access token in the handshake.
 */
export interface RealtimeBus {
  emitToUser(userId: string, event: string, payload: unknown): void;
  emitToConversation(conversationId: string, event: string, payload: unknown): void;
  publishJobEvent(jobId: string): void;
  emitNotification(userId: string, payload: unknown): void;
}

export function attachRealtime(httpServer: HttpServer): RealtimeBus {
  const io = new SocketServer(httpServer, {
    cors: { origin: true, credentials: true },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string) ?? '';
      const claims = verifyAccessToken(token);
      socket.data.userId = claims.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  const userSockets = new Map<string, Set<Socket>>();
  const convRoomsPrefix = 'conv:';

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId)!.add(socket);

    socket.on('conversation:join', (conversationId: string) => {
      socket.join(convRoomsPrefix + conversationId);
    });

    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(convRoomsPrefix + conversationId);
    });

    socket.on('typing', ({ conversationId, isTyping }: { conversationId: string; isTyping: boolean }) => {
      socket.to(convRoomsPrefix + conversationId).emit('typing', { userId, isTyping });
    });

    socket.on('message:read', ({ conversationId }: { conversationId: string }) => {
      socket.to(convRoomsPrefix + conversationId).emit('message:read', { userId, conversationId, at: new Date().toISOString() });
    });

    socket.on('disconnect', () => {
      userSockets.get(userId)?.delete(socket);
      if (userSockets.get(userId)?.size === 0) userSockets.delete(userId);
    });
  });

  const bus: RealtimeBus = {
    emitToUser(userId, event, payload) {
      for (const s of userSockets.get(userId) ?? []) s.emit(event, payload);
    },
    emitToConversation(conversationId, event, payload) {
      io.to(convRoomsPrefix + conversationId).emit(event, payload);
    },
    publishJobEvent(jobId) {
      io.emit('job:new', { jobId });
    },
    emitNotification(userId, payload) {
      bus.emitToUser(userId, 'notification:new', payload);
    },
  };

  return bus;
}
