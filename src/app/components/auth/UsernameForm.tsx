import { useState } from "react";
import { apiClient } from "@lib/api/client";
import { Toast, type ToastVariant } from "../ui/Toast";
import { useAuth } from "./useAuth";

type ToastState = { message: string; variant: ToastVariant } | null;

export function UsernameForm() {
  const { setAuthenticatedUser, user } = useAuth();
  const [username, setUsername] = useState(user?.username ?? "");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  if (!user) return null;

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextUsername = username.trim() || null;
    const currentUsername = user.username?.trim() || null;

    if (currentUsername === nextUsername) {
      setToast({
        message: "That username is already saved.",
        variant: "error",
      });
      return;
    }

    setBusy(true);
    setToast(null);
    try {
      const result = await apiClient.updateUsername(nextUsername);
      setAuthenticatedUser(result.user);
      setUsername(result.user.username ?? "");
      setToast({
        message: result.user.username
          ? "Your username is ready for the Speedrun leaderboard."
          : "Your username was removed. Speedrun entries will use your email name instead.",
        variant: "success",
      });
    } catch (updateError) {
      setToast({
        message:
          updateError instanceof Error ? updateError.message : "Could not save your username.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="profile-username" aria-labelledby="profile-username-title">
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onDismiss={() => setToast(null)}
      />
      <p className="eyebrow">Public identity</p>
      <h2 id="profile-username-title">Username</h2>
      <p>
        This name appears on the public leaderboard. Speedrun uses the name before the @ in your
        email address.
      </p>
      <form onSubmit={submit}>
        <label className="auth-field">
          Username
          <input
            autoComplete="username"
            maxLength={24}
            minLength={3}
            onChange={(event) => setUsername(event.target.value)}
            pattern="[A-Za-z0-9_-]{3,24}"
            type="text"
            value={username}
          />
        </label>
        <button className="button button--primary" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save username"}
        </button>
      </form>
    </section>
  );
}
