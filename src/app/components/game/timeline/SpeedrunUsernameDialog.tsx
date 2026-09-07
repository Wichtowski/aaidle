import { Button } from "@components/ui/Button";
import { useState } from "react";
import { isValidUsername, usernamePattern } from "@lib/auth/username";

export function SpeedrunUsernameDialog({
  email,
  onChoose,
}: {
  email: string;
  onChoose: (username: string | null) => void;
}) {
  const [username, setUsername] = useState("");
  const emailName = email.split("@", 1)[0] ?? email;
  const usernameIsValid = isValidUsername(username);

  return (
    <div
      className="speedrun-username-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="speedrun-username-title"
    >
      <section className="speedrun-username-modal__content">
        <p className="eyebrow">Speedrun complete</p>
        <h2 id="speedrun-username-title">Choose your leaderboard name</h2>
        <p>
          Add a username to use on the public leaderboard, or continue with{" "}
          <strong>{emailName}</strong>
          <> from your email address.</>
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!event.currentTarget.checkValidity() || !usernameIsValid) return;
            onChoose(username);
          }}
        >
          <label className="auth-field">
            <span className="auth-field__label">Username</span>
            <input
              autoFocus
              maxLength={24}
              minLength={3}
              onChange={(event) => setUsername(event.target.value)}
              pattern={usernamePattern}
              required
              type="text"
              value={username}
            />
          </label>
          <div className="speedrun-username-modal__actions">
            <Button variant="outline" onClick={() => onChoose(null)} type="button">
              Use {emailName}
            </Button>
            <Button variant="primary" color="accent" disabled={!usernameIsValid} type="submit">
              Save username
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
