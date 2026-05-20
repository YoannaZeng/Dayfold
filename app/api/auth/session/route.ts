import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthError, clearCurrentSession, getCurrentUser, signIn, signUp } from "@/lib/server/auth";
import { consumeRateLimit, RateLimitError, resetRateLimit } from "@/lib/server/auth-rate-limit";
import { assertSameOrigin, RequestGuardError } from "@/lib/server/request-guard";

const signInSchema = z.object({
  mode: z.literal("login"),
  email: z.string().email(),
  password: z.string().min(6)
});

const signUpSchema = z.object({
  mode: z.literal("signup"),
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8)
});

function getRequestIdentifier(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();

  return forwardedFor || realIp || cfIp || "local";
}

function retryMessage(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `尝试次数太多，请约 ${minutes} 分钟后再试。`;
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      email: user.email,
      name: user.name
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const requestIdentifier = getRequestIdentifier(request);

    if (body.mode === "signup") {
      const parsed = signUpSchema.parse(body);
      await consumeRateLimit({
        scope: "signup:ip",
        identifier: requestIdentifier,
        limit: 5,
        windowSeconds: 60 * 60,
        blockSeconds: 60 * 60
      });
      const user = await signUp(parsed);
      return NextResponse.json({
        user: {
          email: user.email,
          name: user.name
        }
      });
    }

    const parsed = signInSchema.parse(body);
    await Promise.all([
      consumeRateLimit({
        scope: "login:ip",
        identifier: requestIdentifier,
        limit: 25,
        windowSeconds: 10 * 60,
        blockSeconds: 15 * 60
      }),
      consumeRateLimit({
        scope: "login:email",
        identifier: parsed.email,
        limit: 8,
        windowSeconds: 10 * 60,
        blockSeconds: 15 * 60
      })
    ]);
    const user = await signIn(parsed);
    await Promise.all([
      resetRateLimit("login:ip", requestIdentifier),
      resetRateLimit("login:email", parsed.email)
    ]);
    return NextResponse.json({
      user: {
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: retryMessage(error.retryAfterSeconds) }, { status: 429 });
    }

    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof RequestGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "请检查邮箱和密码格式，注册密码至少 8 位。" }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "登录失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await clearCurrentSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "退出失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
