const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLoopbackRequest(request) {
  return LOOPBACK_ADDRESSES.has(request.socket?.remoteAddress || "");
}

export function hasSameOrigin(request, { allowMissing = false } = {}) {
  const origin = request.headers.origin;
  if (!origin) return allowMissing;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}
