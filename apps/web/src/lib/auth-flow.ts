export type AuthIssue = "conflict" | "rate-limit" | "expired" | "other";

export function normalizeOtp(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function resendSeconds(sentAt: number, now = Date.now()) {
  return Math.max(0, 60 - Math.floor((now - sentAt) / 1000));
}

export function classifyAuthIssue(message: string): AuthIssue {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate limit")) return "rate-limit";
  if (normalized.includes("expired")) return "expired";
  if (
    normalized.includes("already") ||
    normalized.includes("exists") ||
    normalized.includes("registered")
  ) return "conflict";
  return "other";
}
