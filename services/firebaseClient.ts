import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDZoHHISX-aGLMhhHPhk5vFdXk2lK-jAEk",
  authDomain: "dysartic-voice-ai.firebaseapp.com",
  databaseURL: "https://dysartic-voice-ai-default-rtdb.firebaseio.com",
  projectId: "dysartic-voice-ai",
  storageBucket: "dysartic-voice-ai.firebasestorage.app",
  messagingSenderId: "1045076127366",
  appId: "1:1045076127366:web:4b38993cb702f1e8b5ab07",
  measurementId: "G-CPT6GNVN4H"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the database instance
export const db = getDatabase(app);
