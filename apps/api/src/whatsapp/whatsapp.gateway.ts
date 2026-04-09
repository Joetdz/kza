import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ConfigService } from '@nestjs/config';
import { WhatsAppService } from './whatsapp.service';

@WebSocketGateway({ namespace: '/whatsapp', cors: { origin: '*', credentials: true } })
export class WhatsAppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WhatsAppGateway.name);
  private readonly JWKS: ReturnType<typeof createRemoteJWKSet>;

  // Map userId → Set of socketIds
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private config: ConfigService,
    private waService: WhatsAppService,
  ) {
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL');
    this.JWKS = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }

  onModuleInit() {
    // Register emit callback so WhatsAppService can push to clients
    this.waService.setGatewayEmit((event, userId, data) => {
      this.emitToUser(userId, event, data);
    });

    // Reconnect sessions that were active before restart
    this.waService.reconnectAll();
  }

  afterInit(server: Server) {
    // Auth middleware — verify Supabase JWT
    server.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth?.token as string;
        if (!token) return next(new Error('Unauthorized'));

        const { payload } = await jwtVerify(token, this.JWKS);
        (socket as any).userId = payload.sub as string;
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
  }

  handleConnection(socket: Socket) {
    const userId = (socket as any).userId as string;
    if (!userId) return;

    if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set());
    this.userSockets.get(userId)!.add(socket.id);

    this.logger.log(`WA socket connected: ${userId} (${socket.id})`);
  }

  handleDisconnect(socket: Socket) {
    const userId = (socket as any).userId as string;
    if (userId) {
      this.userSockets.get(userId)?.delete(socket.id);
    }
  }

  private emitToUser(userId: string, event: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      this.server.to(socketId).emit(event, data);
    }
  }
}
