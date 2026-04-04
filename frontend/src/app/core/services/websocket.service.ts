import { Injectable, OnDestroy, signal } from '@angular/core';
import { Client, StompSubscription } from '@stomp/stompjs';
import { environment } from '../../../environments/environment';
import { NoteUpdateMessage } from '../models/websocket.models';

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private client: Client;
  private subs = new Map<string, StompSubscription>();
  isConnected = signal(false);

  constructor() {
    this.client = new Client({ reconnectDelay: 5000 });
    this.client.onConnect    = () => this.isConnected.set(true);
    this.client.onDisconnect = () => this.isConnected.set(false);
    this.client.onStompError = () => this.isConnected.set(false);
  }

  connect(token: string): void {
    const wsUrl = environment.wsUrl ||
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    this.client.configure({
      brokerURL: wsUrl,
      connectHeaders: { Authorization: `Bearer ${token}` }
    });
    this.client.activate();
  }

  subscribeToNote(noteId: string, handler: (msg: NoteUpdateMessage) => void): void {
    if (!this.isConnected()) return;
    this.unsubscribeFromNote(noteId); // clean up any previous subscription
    const sub = this.client.subscribe(`/topic/notes/${noteId}`, (frame) => {
      try {
        const msg: NoteUpdateMessage = JSON.parse(frame.body);
        handler(msg);
      } catch { /* ignore malformed */ }
    });
    this.subs.set(noteId, sub);
  }

  unsubscribeFromNote(noteId: string): void {
    this.subs.get(noteId)?.unsubscribe();
    this.subs.delete(noteId);
  }

  disconnect(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.subs.clear();
    this.client.deactivate();
    this.isConnected.set(false);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
