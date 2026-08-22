import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * crypto.randomUUID() only exists in "secure contexts" - HTTPS, or
 * localhost. Load this app over a plain LAN IP (http://192.168.x.x:3000,
 * which this project's config points at by default) and the browser
 * removes the function entirely, throwing "crypto.randomUUID is not a
 * function". This falls back to crypto.getRandomValues (available
 * everywhere) and, failing that, Math.random, so id generation never
 * breaks regardless of how the app is accessed.
 */
export function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Last-resort fallback - not cryptographically strong, but this is only
  // ever used as a local UI/message id, never for anything security-sensitive.
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}