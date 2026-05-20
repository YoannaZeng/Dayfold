import { NextRequest } from "next/server";

export class RequestGuardError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "RequestGuardError";
    this.status = status;
  }
}

function getHeaderOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) {
    return null;
  }

  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "") ?? "http";
  return `${proto}://${host}`;
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function originMatches(left: string, right: string) {
  if (left === right) {
    return true;
  }

  if (process.env.NODE_ENV === "production") {
    return false;
  }

  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);

    return (
      leftUrl.protocol === rightUrl.protocol &&
      leftUrl.port === rightUrl.port &&
      isLocalHostname(leftUrl.hostname) &&
      isLocalHostname(rightUrl.hostname)
    );
  } catch {
    return false;
  }
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return;
  }

  const publicOrigin = process.env.DAYFOLD_PUBLIC_ORIGIN;
  const allowedOrigins = [
    request.nextUrl.origin,
    getHeaderOrigin(request),
    publicOrigin
  ].filter((value): value is string => Boolean(value));

  if (!allowedOrigins.some((allowedOrigin) => originMatches(origin, allowedOrigin))) {
    throw new RequestGuardError("请求来源不安全，请刷新页面后重试。");
  }
}
