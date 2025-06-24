import { io } from "socket.io-client";

// Get WebSocket URL from environment variables
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://raw-backend-gyii.onrender.com"; // Updated to use WebSocket Secure (wss://) for production
const isDev = process.env.NEXT_PUBLIC_APP_ENV !== "production";

let socket;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 2000; // 2 seconds
const PING_TIMEOUT = 10000; // 10 seconds

export const getSocket = (deviceId) => {
  if (!socket) {
    const options = {
      auth: { deviceId },
      autoConnect: false,
      transports: ["websocket", "polling"], // Try both transports
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY,
      reconnectionDelayMax: 10000, // 10 seconds max delay
      timeout: PING_TIMEOUT * 2, // Double the ping timeout
      forceNew: true,
      withCredentials: false, // Disable credentials
      secure: false, // Not using HTTPS in development
      rejectUnauthorized: false, // For development only
      path: "/socket.io/", // Make sure path matches backend
      transports: ["websocket", "polling"], // Try both transports
      upgrade: true, // Allow upgrades
      rememberUpgrade: true, // Remember upgrade
      pingTimeout: PING_TIMEOUT,
      pingInterval: 25000, // 25 seconds
    };

    socket = io(WS_URL, options);

    // Debug logging in development
    if (isDev) {
      socket.onAny((event, ...args) => {
        console.log(`[SocketIO] Event: ${event}`, args);
      });
    }

    // Connection established
    socket.on("connect", () => {
      reconnectAttempts = 0;
      console.log("[SocketIO] Connected:", socket.id);
    });

    // Connection error
    socket.on("connect_error", (error) => {
      reconnectAttempts++;
      console.error(
        `[SocketIO] Connection error (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}):`,
        error.message
      );

      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error("[SocketIO] Max reconnection attempts reached");
        // You might want to trigger a UI update here
      }
    });

    // Disconnected
    socket.on("disconnect", (reason) => {
      console.log(`[SocketIO] Disconnected: ${reason}`);
      if (reason === "io server disconnect") {
        // The disconnection was initiated by the server, you need to reconnect manually
        socket.connect();
      }
    });

    // Reconnection attempt
    socket.on("reconnect_attempt", (attempt) => {
      console.log(`[SocketIO] Reconnection attempt ${attempt}`);
    });

    // Reconnection failed
    socket.on("reconnect_failed", () => {
      console.error("[SocketIO] Reconnection failed");
    });
  }

  return socket;
};

// Utility function to safely emit events
export const safeEmit = (event, data, callback) => {
  if (!socket || !socket.connected) {
    console.error("[SocketIO] Cannot emit: Socket not connected");
    return false;
  }

  return new Promise((resolve, reject) => {
    socket.emit(event, data, (response) => {
      if (response?.error) {
        console.error(`[SocketIO] Error in ${event}:`, response.error);
        reject(response.error);
      } else {
        resolve(response);
      }
    });
  });
};

// Disconnect and cleanup
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
