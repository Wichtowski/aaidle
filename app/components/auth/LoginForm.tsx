"use client";

import { useState } from "react";
import { FaGithub, FaGoogle } from "react-icons/fa6";

type FormMode = "sign-in" | "register";

export function LoginForm() {
  const [mode, setMode] = useState<FormMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "register" && password !== confirmPassword) {
      setNotice("Passwords do not match.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/v1/auth/${mode === "register" ? "register" : "password"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not sign in.");
      window.location.assign("/classic");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-card__providers">
        <a className="button" href="/api/v1/auth/oauth/github">
          <FaGithub aria-hidden="true" /> Continue with GitHub
        </a>
        <a className="button" href="/api/v1/auth/oauth/google">
          <FaGoogle aria-hidden="true" /> Continue with Google
        </a>
      </div>
      <div className="auth-divider">or use your email</div>
      <label className="auth-field">
        Email
        <input
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <form className="auth-card__password" onSubmit={submitPassword}>
        <label className="auth-field">
          Password
          <input
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={mode === "register" ? 12 : undefined}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {mode === "register" && (
          <label className="auth-field">
            Retype password
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </label>
        )}
        <button className="button button--primary" disabled={busy || !email || !password} type="submit">
          {mode === "register" ? "Create account" : "Sign in"}
        </button>
      </form>
      <button
        className="auth-card__toggle"
        onClick={() => {
          setMode((current) => (current === "sign-in" ? "register" : "sign-in"));
          setConfirmPassword("");
          setNotice(null);
        }}
        type="button"
      >
        {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
      </button>
      {notice && <p aria-live="polite" className="auth-card__notice">{notice}</p>}
    </div>
  );
}
