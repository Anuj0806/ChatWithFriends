// Centralised runtime config. Override via a .env file + Vite's
// import.meta.env in real deployments instead of hardcoding IPs.
export const API_HOST = import.meta.env.VITE_API_HOST || "192.168.1.41";
export const API_PORT = import.meta.env.VITE_API_PORT || "2000";

export const API_BASE_PUBLIC = `http://${API_HOST}:${API_PORT}/public`;
export const API_BASE = `http://${API_HOST}:${API_PORT}/private`;

export const CHAT_TYPE_PUBLIC = "public";
export const CHAT_TYPE_PRIVATE = "private";
export const WS_URL = `http://${API_HOST}:${API_PORT}/ws`;
export const SECRET_KEY = "12345678901234567890123456789012";
