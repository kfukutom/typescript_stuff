/**
 * Multiplayer Room Client
 */

import { io, type Socket } from 'socket.io-client';
import { Observable } from './observer';
import type { z } from 'zod';


/** Info about a player in a room */
export interface RoomPlayer {
  /** Display name of the player */
  displayName: string;
  /** Whether this player is the room host */
  isHost: boolean;
  /** Whether this is the current client */
  isSelf: boolean;
}

export interface ServerToClientEvents {

  /** Room was closed  */
  "room-closed": () => void;
  
  /** Client was promoted to host */
  "promoted-to-host": () => void;

  /** Client should synchronize its game to the given config/state */
  "sync": (gameData: unknown) => void;

  /**
   * Client should attempt to perform the given action and respond with updated state.
   * If the action is not valid for the current game state, the client should still
   * respond with the existing, unmodified state.
   */
  "action": (data: { action: unknown }, callback: (updatedState: unknown) => void) => void;

  /** Player list changed (join, leave, host promotion) */
  "room-players": (players: RoomPlayer[]) => void;
}



export interface ClientToServerEvents {

  /** Request to create a new room and join as host */
  "create-room": (displayName: string, gameData: unknown, callback: (response: { room_id: string, gameData: unknown } | { error: string }) => void) => void;
  
  /** Request to join an existing room */
  "join-room": (displayName: string, room_id: string, callback: (response: { room_id: string, gameData: unknown } | { error: string }) => void) => void;
  
  /** Request to leave the current room (stay connected to server) */
  "leave-room": (callback?: (response: { success: true } | { error: string }) => void) => void;
  
  /** Client submits an action, which will be broadcast to all clients (including back to this sender) */
  "submit-action": (action: unknown, callback?: (response: { success: true } | { error: string }) => void) => void;
  
  /** Client submits a sync request with the full game state (only host is allowed to do this) */
  "submit-sync": (gameData: unknown, callback: (response: { success: true } | { error: string }) => void) => void;
}



/**
 * Handler for game events. Set via setHandler().
 */
export interface GameHandler<StateType, ActionType> {
  
  /** 
   * Called when an action is broadcast from the server.
   * Apply the action and return the updated game state.
   */
  performAction(action: ActionType): StateType;
  
  /**
   * Called when updated game state is received from the server,
   * e.g. after joining a room or when the host submits a sync.
   */
  performSync(data: StateType): void;
  
}

/** Typed socket for the room server protocol */
type MultiplayerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type MultiplayerClientStatus = {
  readonly status: "connected",
  readonly current_room: {
    readonly room_id: string,
    readonly isHost: boolean,
  } | undefined
} | {
  readonly status: "disconnected",
  readonly current_room: undefined
};

export interface MultiplayerClientObserver {
  onStatus?(status: MultiplayerClientStatus): void;
  onPlayers?(players: readonly RoomPlayer[]): void;
}

/** Server connection configuration */
export interface ServerConfig {
  /** URL of the relay server */
  url: string;
  /** Custom Socket.IO path (default: '/socket.io/') */
  path?: string | undefined;
}


export class MultiplayerClient<StateSchema extends z.ZodSchema, ActionSchema extends z.ZodSchema> {

  private readonly displayName: string;
  private readonly stateSchema: StateSchema;
  private readonly actionSchema: ActionSchema;
  private readonly handler: GameHandler<z.infer<StateSchema>, z.infer<ActionSchema>>;

  private readonly socket: MultiplayerSocket;
  
  /** Room we're trying to be in (persists across disconnects for auto-rejoin) */
  private _targetRoomId: string | undefined;

  private _status: MultiplayerClientStatus;
  
  /** Observable for status changes */
  public readonly events = new Observable<MultiplayerClientObserver>();
  
  /**
   * Create a multiplayer client that connects to the given server.
   * Connection happens in the background - client starts in disconnected state.
   * @param server Server connection configuration
   * @param displayName Display name for this player
   * @param handler Handler for game events (actions, syncs)
   */
  public constructor(
    server: ServerConfig, displayName: string, stateSchema: StateSchema, actionSchema: ActionSchema,
    handler: GameHandler<z.infer<StateSchema>, z.infer<ActionSchema>>
  ) {
    this.displayName = displayName;
    this.stateSchema = stateSchema;
    this.actionSchema = actionSchema;
    this.handler = handler;
    
    this._status = { status: "disconnected", current_room: undefined };

    this.socket = io(server.url, server.path ? { path: server.path } : undefined);
    this.setUpSocket();
  }
  
  private setStatus(status: MultiplayerClientStatus) {
    this._status = status;
    this.events.emit('onStatus', status);
  }
  
  private setUpSocket() {
    // On connect (including reconnect), try to rejoin room if we have one
    this.socket.on('connect', async () => {
      console.log('[multiplayer] Connected to server');
      this.setStatus({ status: "connected", current_room: undefined });
      if (this._targetRoomId) {
        try {
          await this.attemptToJoinRoom(this._targetRoomId);
        } catch (e) {
          // Room no longer exists - clear target so we don't keep trying
          console.log(`[multiplayer] Auto-rejoin failed: ${e instanceof Error ? e.message : e}`);
          this._targetRoomId = undefined;
        }
      }
    });
    
    // Listen for action broadcasts - apply via handler and respond with updated state
    this.socket.on('action', (data, callback) => {
      const parsedAction = this.actionSchema.safeParse(data.action);
      if (!parsedAction.success) {
        console.warn('Ignoring invalid action from server:', parsedAction.error);
        return;
      }
      callback(this.handler.performAction(parsedAction.data));
    });
    
    // Listen for room closure - clear target so we don't try to rejoin
    this.socket.on('room-closed', () => {
      this._targetRoomId = undefined;
      this.setStatus({ status: "connected", current_room: undefined });
    });

    this.socket.on('sync', (gameData) => {
      const parsedData = this.stateSchema.safeParse(gameData);
      if (!parsedData.success) {
        console.warn('Ignoring invalid sync data from server:', parsedData.error);
        return;
      }
      this.handler.performSync(parsedData.data);
    });

    // Listen for player list updates
    this.socket.on('room-players', (players) => {
      if (!this._status.current_room) {
        console.warn('[multiplayer] Received room-players but not currently in a room');
        return;
      }
      const selfPlayer = players.find(p => p.isSelf);
      if (selfPlayer && selfPlayer.isHost !== this._status.current_room.isHost) {
        this.setStatus({ 
          status: "connected", 
          current_room: { ...this._status.current_room, isHost: selfPlayer.isHost } 
        });
      }
      this.events.emit('onPlayers', players);
    });

    // Listen for host promotion (legacy - room-players should also be sent)
    this.socket.on('promoted-to-host', () => {
      if (!this._status.current_room) {
        console.warn('[multiplayer] Received promoted-to-host but not currently in a room');
        return;
      }
      this.setStatus({ status: "connected", current_room: { ...this._status.current_room, isHost: true } });
    });
    
    // On disconnect, keep _targetRoomId so we can try to rejoin on reconnect
    this.socket.on('disconnect', (reason) => {
      console.log(`[multiplayer] Disconnected: ${reason}`);
      this.setStatus({ status: "disconnected", current_room: undefined });
    });

    // Connection errors during reconnection - Socket.IO handles retry
    this.socket.on('connect_error', (err) => {
      console.log(`[multiplayer] Connection error: ${err.message}`);
      this.setStatus({ status: "disconnected", current_room: undefined });
    });
  }

  // =========================================================================
  // Room Management
  // =========================================================================
  
  /**
   * Request
   * @returns The room ID for others to join
   */
  async attemptToCreateRoom(gameData: z.infer<StateSchema>): Promise<string> {
    
    // We don't need to tell the server separately that we're leaving our
    // current room - it automatically does that when we ask to create a new one.
    const response = await this.socket.emitWithAck('create-room', this.displayName, gameData);
    
    if ('error' in response) {
      throw new Error(response.error);
    }
    
    console.log(`[multiplayer] Hosting room: ${response.room_id}`);
    this._targetRoomId = response.room_id;
    this.setStatus({ 
      status: "connected", 
      current_room: { 
        room_id: response.room_id, 
        isHost: true
      } 
    });
    
    return response.room_id;
  }
  
  /**
   * Join an existing room.
   * If already in a different room, the server will leave it automatically.
   * @param room_id The room ID to join
   * @returns The current game data from the room
   */
  async attemptToJoinRoom(room_id: string): Promise<void> {
    
    console.log(`[multiplayer] Attempting to join room: ${room_id}`);
    
    // We don't need to tell the server separately that we're leaving our
    // current room - it automatically does that when we ask to join a new one.
    const response = await this.socket.emitWithAck('join-room', this.displayName, room_id);
    
    if ('error' in response) {
      throw new Error(response.error);
    }
    
    console.log(`[multiplayer] Joined room: ${room_id}`);
    this._targetRoomId = room_id;
    this.setStatus({ 
      status: "connected", 
      current_room: { 
        room_id, 
        isHost: false
      } 
    });

    const parsedData = this.stateSchema.safeParse(response.gameData);
    if (!parsedData.success) {
      console.warn('Ignoring invalid game data from server:', parsedData.error);
      return;
    }
    this.handler.performSync(parsedData.data);
  }
  
  /**
   * Leave the current room. Can host or join another room after.
   */
  leaveRoom(): void {
    this._targetRoomId = undefined;
    this.setStatus({ status: "connected", current_room: undefined });
    // Tell server we're leaving (fire and forget)
    this.socket.emit('leave-room');
  }
  
  /**
   * Submit an action to the server, which is then broadcast
   * to all clients (including back to self)
   */
  async submitAction(action: unknown): Promise<void> {
    if (!this._status.current_room) {
      throw new Error('Not in a room');
    }
    
    const response = await this.socket.emitWithAck('submit-action', action);
    
    if ('error' in response) {
      throw new Error(response.error);
    }
  }
  
  /** 
   * Host-only: Submit a new game state to the server, which
   * is then broadcast to all clients (including self) to be synced.
   */
  async submitSync(gameData: z.infer<StateSchema>): Promise<void> {
    if (!this._status.current_room?.isHost) {
      throw new Error('Only a room host can submit sync');
    }
    
    const response = await this.socket.emitWithAck('submit-sync', gameData);
    
    if ('error' in response) {
      throw new Error(response.error);
    }
  }

  // =========================================================================
  // Connection
  // =========================================================================
  
  /** Fully disconnect from the server */
  dispose(): void {
    this._targetRoomId = undefined;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.setStatus({ status: "disconnected", current_room: undefined });
    this.events.clearObservers();
  }

  getStatus(): Readonly<MultiplayerClientStatus> {
    return this._status;
  }
}