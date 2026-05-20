"use client";

import { useState } from "react";

type AuthMode = "login" | "signup";

function getPasswordStrength(password: string) {
  const checks = [
    password.length >= 8,
    /[A-Za-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];
  const score = checks.filter(Boolean).length;

  if (!password) {
    return {
      score: 0,
      label: "至少 8 位，建议包含字母和数字。"
    };
  }

  if (score <= 2) {
    return {
      score,
      label: "偏弱，建议加入数字或符号。"
    };
  }

  if (score === 3) {
    return {
      score,
      label: "可用，继续加强会更安全。"
    };
  }

  return {
    score,
    label: "强度不错。"
  };
}

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordStrength = getPasswordStrength(password);

  async function handleSubmit() {
    if (mode === "signup" && password.length < 8) {
      setError("注册密码至少需要 8 位。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode,
          email,
          name,
          password
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "登录失败。" }));
        throw new Error(body.error ?? "登录失败。");
      }

      window.location.reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "登录失败。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <section className="auth-card">
        <p className="section-kicker">Dayfold</p>
        <h1 className="auth-title">登录你的 Dayfold</h1>
        <p className="auth-copy">从这一版开始，计划、进展、实际和复盘都会绑定到你的个人账号。</p>

        <div className="mode-toggle auth-toggle">
          <button className={`mode-pill${mode === "signup" ? " active" : ""}`} type="button" onClick={() => setMode("signup")}>
            注册
          </button>
          <button className={`mode-pill${mode === "login" ? " active" : ""}`} type="button" onClick={() => setMode("login")}>
            登录
          </button>
        </div>

        <div className="field-stack auth-fields">
          {mode === "signup" ? (
            <input type="text" placeholder="你的名字" value={name} onChange={(event) => setName(event.target.value)} />
          ) : null}
          <input type="email" placeholder="邮箱" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input
            type="password"
            placeholder={mode === "signup" ? "密码（至少 8 位）" : "密码"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
          />
          {mode === "signup" ? (
            <div className="password-strength" aria-live="polite">
              <div className="password-strength-track">
                <span className={`password-strength-bar score-${passwordStrength.score}`} />
              </div>
              <span>{passwordStrength.label}</span>
            </div>
          ) : null}
        </div>

        {error ? <div className="error-banner auth-error">{error}</div> : null}

        <button className="button button-primary auth-submit" type="button" disabled={submitting} onClick={() => void handleSubmit()}>
          {submitting ? "提交中..." : mode === "signup" ? "创建账号并进入" : "登录并进入"}
        </button>

        <p className="auth-tip">
          {mode === "signup"
            ? "Beta 测试期：你的内容会绑定到当前账号，重要内容建议定期备份。"
            : "如果之前已经注册过，直接用邮箱和密码登录即可。"}
        </p>
      </section>
    </main>
  );
}
