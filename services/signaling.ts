import { db } from "./firebaseClient";
import { ref, push, onChildAdded, remove, set } from "firebase/database";
import { SignalingMessage } from "../types";

/**
 * Firebase-based signaling service.
 * Replaces PeerJS entirely.
 * Works across all networks instantly (LTE, WiFi, hotspots, school, etc.)
 */
export class SignalingService {
  private sessionPath: string;
  private myId: string;
  private onMessageCallback: ((msg: SignalingMessage) => void) | null = null;

  constructor(private sessionId: string) {
    this.sessionPath = `sessions/${sessionId}`;
    this.myId = Math.random().toString(36).slice(2, 10); // random client id
  }

  connect(
    role: "host" | "guest",
    onMessage: (msg: SignalingMessage) => void
  ) {
    this.onMessageCallback = onMessage;

    // Mark presence for debugging
    set(ref(db, `${this.sessionPath}/presence/${this.myId}`), role);

    // Listen for signaling messages
    onChildAdded(ref(db, `${this.sessionPath}/messages`), (snap) => {
      const msg = snap.val();
      if (!msg) return;

      // Ignore own messages
      if (msg.senderId === this.myId) return;

      if (this.onMessageCallback) {
        this.onMessageCallback(msg);
      }
    });
  }

  send(msg: SignalingMessage) {
    push(ref(db, `${this.sessionPath}/messages`), {
      ...msg,
      senderId: this.myId,
      ts: Date.now(),
    });
  }

  close() {
    // Remove presence marker when user leaves
    remove(ref(db, `${this.sessionPath}/presence/${this.myId}`));
  }
}
