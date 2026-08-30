import { useState } from "react";

export function SpeedrunUsernameDialog({
  email,
  onChoose,
}: {
  email: string;
  onChoose: (username: string | null) => void;
}) {
  const [username, setUsername] = useState("");
  const emailName = email.split("@", 1)[0] ?? email;
  const usernameIsValid = /^[A-Za-z0-9_-]{3,24}$/.test(username);

  return (
    <div className="speedrun-username-modal" role="dialog" aria-modal="true" aria-labelledby="speedrun-username-title">
      <section className="speedrun-username-modal__content">
        <p className="eyebrow">Speedrun complete</p>
        <h2 id="speedrun-username-title">Choose your leaderboard name</h2>
        <p>
          Add a username to use on the public leaderboard, or continue with <strong>{emailName}</strong>
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
              pattern="[A-Za-z0-9_-]{3,24}"
              required
              type="text"
              value={username}
            />
          </label>
          <div className="speedrun-username-modal__actions">
            <button className="button" onClick={() => onChoose(null)} type="button">
              Use {emailName}
            </button>
            <button className="button button--primary" disabled={!usernameIsValid} type="submit">
              Save username
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
