"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL } from "./api";

let globalSocket = null;
let activeToken = null;
let connectionCount = 0;
const subscribers = new Set();
const statusListeners = new Set();
let currentStatus = "disconnected";

function setRealtimeStatus(newStatus) {
  if (currentStatus !== newStatus) {
    currentStatus = newStatus;
    statusListeners.forEach((listener) => {
      try {
        listener(newStatus);
      } catch (err) {
        console.error("Error in status listener:", err);
      }
    });
  }
}

function getOrCreateSocket(token) {
  if (!token) return null;

  if (globalSocket && activeToken === token && (globalSocket.connected || !globalSocket.disconnected)) {
    return globalSocket;
  }

  if (globalSocket) {
    globalSocket.removeAllListeners();
    globalSocket.disconnect();
    globalSocket = null;
  }

  activeToken = token;
  setRealtimeStatus("connecting");

  // Determine base socket host
  const socketUrl = API_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "");

  globalSocket = io(socketUrl, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  globalSocket.on("connect", () => {
    setRealtimeStatus("connected");
  });

  globalSocket.on("disconnect", (reason) => {
    setRealtimeStatus("disconnected");
    if (reason === "io server disconnect") {
      // Reconnect manually if disconnected by the server
      globalSocket?.connect();
    }
  });

  globalSocket.on("connect_error", (error) => {
    setRealtimeStatus("disconnected");
    console.warn("Live updates connection error:", error.message);
  });

  const forwardEvent = (eventName) => (payload = {}) => {
    subscribers.forEach((callback) => {
      try {
        callback({ eventName, ...payload });
      } catch (err) {
        console.error("Error in realtime subscriber:", err);
      }
    });
  };

  globalSocket.on("workspace:changed", forwardEvent("workspace:changed"));
  globalSocket.on("attendance:updated", forwardEvent("attendance:updated"));
  globalSocket.on("tasks:updated", forwardEvent("tasks:updated"));
  globalSocket.on("leads:updated", forwardEvent("leads:updated"));
  globalSocket.on("employees:updated", forwardEvent("employees:updated"));

  return globalSocket;
}

export function useRealtimeStatus() {
  const [status, setStatus] = useState(
    globalSocket?.connected ? "connected" : currentStatus
  );

  useEffect(() => {
    const handleStatus = (nextStatus) => setStatus(nextStatus);
    statusListeners.add(handleStatus);
    if (globalSocket?.connected) {
      setStatus("connected");
    }
    return () => {
      statusListeners.delete(handleStatus);
    };
  }, []);

  return status;
}

/**
 * Hook to subscribe to workspace updates.
 * - Listens for live Socket.IO events for instantaneous updates.
 * - Automatically falls back to background polling if disconnected or in a non-WebSocket environment.
 */
export function useWorkspaceUpdates(token, resources, onChange, { fallbackIntervalMs = 12000 } = {}) {
  const onChangeRef = useRef(onChange);
  const resourceKey = Array.isArray(resources) ? resources.join(",") : "";

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!token) return undefined;

    const subscribedSet = new Set(resourceKey.split(","));
    connectionCount++;
    getOrCreateSocket(token);

    const handlePayload = (payload) => {
      const resource = payload.resource;
      // Match if specific resource is subscribed or if generic workspace changed
      if (subscribedSet.has(resource) || (payload.eventName === "workspace:changed" && subscribedSet.has(resource))) {
        if (typeof onChangeRef.current === "function") {
          onChangeRef.current(payload);
        }
      }
    };

    subscribers.add(handlePayload);

    // Fallback polling timer:
    // If the socket drops or environment blocks WebSockets, this ensures the screen is never stale!
    const fallbackTimer = setInterval(() => {
      if (!globalSocket || !globalSocket.connected) {
        if (typeof onChangeRef.current === "function") {
          onChangeRef.current({ isFallbackPoll: true });
        }
      }
    }, fallbackIntervalMs);

    return () => {
      subscribers.delete(handlePayload);
      clearInterval(fallbackTimer);
      connectionCount--;

      // Disconnect socket if no components are using it after a short grace period
      if (connectionCount <= 0) {
        connectionCount = 0;
        setTimeout(() => {
          if (connectionCount === 0 && globalSocket) {
            globalSocket.disconnect();
            globalSocket = null;
            activeToken = null;
            setRealtimeStatus("disconnected");
          }
        }, 3000);
      }
    };
  }, [resourceKey, token, fallbackIntervalMs]);
}
