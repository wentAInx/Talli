export function firstHeaderValue(value: string | null): string | null {
  return value?.split(",", 1)[0]?.trim() || null;
}

export function isSameOriginRequest(request: Request): boolean {
  const rawOrigin = request.headers.get("origin");
  const targetHost =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstHeaderValue(request.headers.get("host"));
  const targetProtocol =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    new URL(request.url).protocol.slice(0, -1);
  if (!rawOrigin || !targetHost || !targetProtocol) return false;
  try {
    const origin = new URL(rawOrigin);
    return origin.origin === `${targetProtocol}://${targetHost}`;
  } catch {
    return false;
  }
}
