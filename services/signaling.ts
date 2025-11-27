import { SignalingMessage } from '../types';

// Declare PeerJS global from CDN
declare const Peer: any;

/**
 * Signaling service using PeerJS (WebRTC DataChannels).
 * This allows cross-device communication using the public PeerJS cloud server.
 */
export class SignalingService {
  private peer: any = null;
  private connections: any[] = []; // Store multiple guest connections
  private onMessageCallback: ((msg: SignalingMessage) => void) | null = null;
  private role: 'host' | 'guest' = 'guest';
  private retryTimer: any = null;

  constructor(private sessionId: string) {}

  connect(role: 'host' | 'guest', onMessage: (msg: SignalingMessage) => void) {
    this.role = role;
    this.onMessageCallback = onMessage;

    // Clean up session ID: Lowercase and alphanumeric only to ensure consistency
    // Prefix helps avoid collisions on the public server
    const cleanSessionId = `dysarthria-${this.sessionId.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    if (this.role === 'host') {
      // HOST: Initialize with the specific Session ID so guests can find us
      try {
          this.peer = new Peer(cleanSessionId, {
            debug: 1
          });
      } catch (e) {
          console.error("Failed to create Host Peer:", e);
          return;
      }

      this.peer.on('open', (id: string) => {
        console.log('Host initialized with ID:', id);
      });

      // Listen for incoming connections from Guests
      this.peer.on('connection', (conn: any) => {
        console.log("Host received connection from:", conn.peer);
        this.setupConnection(conn);
      });
      
      this.peer.on('error', (err: any) => {
        console.error("Host Peer error:", err);
        if (err.type === 'unavailable-id') {
            console.error("Session ID taken. This usually means a ghost session is lingering. Try a new ID.");
        }
      });

    } else {
      // GUEST: Initialize with a random ID
      try {
          this.peer = new Peer(null, {
            debug: 1
          });
      } catch (e) {
          console.error("Failed to create Guest Peer:", e);
          return;
      }

      this.peer.on('open', (id: string) => {
        console.log("Guest initialized with ID:", id);
        this.connectToHost(cleanSessionId);
      });
      
      this.peer.on('error', (err: any) => {
          console.error("Guest Peer error:", err.type, err);
          // Retry on peer-unavailable (Host might not be ready yet)
          if (err.type === 'peer-unavailable') {
              console.log("Host unavailable. Retrying in 2s...");
              if (this.retryTimer) clearTimeout(this.retryTimer);
              this.retryTimer = setTimeout(() => {
                  this.connectToHost(cleanSessionId);
              }, 2000);
          }
      });
    }
  }

  private connectToHost(hostId: string) {
      if (!this.peer || this.peer.destroyed) return;
      
      console.log("Guest attempting to connect to:", hostId);
      const conn = this.peer.connect(hostId, {
          reliable: true
      });
      
      // If connection fails immediately locally (rare for PeerJS, usually emits error on peer)
      if (!conn) { 
          console.error("Connection object creation failed");
          return;
      }

      this.setupConnection(conn);
  }

  private setupConnection(conn: any) {
    conn.on('open', () => {
      console.log("Connection established with:", conn.peer);
      this.connections.push(conn);
      
      // If we were retrying, stop now
      if (this.retryTimer) {
          clearTimeout(this.retryTimer);
          this.retryTimer = null;
      }
    });

    conn.on('data', (data: any) => {
      // console.log("Received data:", data);
      if (this.onMessageCallback) {
        this.onMessageCallback(data as SignalingMessage);
      }
    });

    conn.on('close', () => {
      console.log("Connection closed with:", conn.peer);
      this.connections = this.connections.filter(c => c !== conn);
    });
    
    conn.on('error', (err: any) => {
        console.error("Connection-level error:", err);
    });
  }

  send(message: SignalingMessage) {
    // Broadcast to all active connections
    this.connections.forEach(conn => {
        if (conn.open) {
            conn.send(message);
        } else {
            console.warn("Cannot send, connection not open:", conn.peer);
        }
    });
  }

  close() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.connections.forEach(c => c.close());
    this.connections = [];
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}