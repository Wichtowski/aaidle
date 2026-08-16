"use client";

import { useEffect, useRef, useState } from "react";
import { FaCookieBite } from "react-icons/fa6";

const consentCookie = "aaidle_cookie_consent";

function readConsent() {
  return document.cookie.split("; ").some((entry) => entry.startsWith(`${consentCookie}=`));
}

export function CookieConsent() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [requiresChoice, setRequiresChoice] = useState(false);

  useEffect(() => {
    setRequiresChoice(!readConsent());
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (requiresChoice && !dialog.open) dialog.showModal();
    if (!requiresChoice && dialog.open) dialog.close();
  }, [requiresChoice]);

  const choose = (value: "accepted" | "essential") => {
    document.cookie = `${consentCookie}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`;
    setRequiresChoice(false);
  };

  const keepOpen = () => {
    if (!readConsent() && !dialogRef.current?.open) dialogRef.current?.showModal();
  };

  return (
    <dialog
      ref={dialogRef}
      className="cookie-consent"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
      onCancel={(event) => event.preventDefault()}
      onClose={keepOpen}
    >
      <div className="cookie-consent__icon" aria-hidden="true">
        <FaCookieBite focusable="false" />
      </div>
      <div className="cookie-consent__body">
        <p className="eyebrow">Your privacy</p>
        <h2 id="cookie-consent-title">Cookies, with no escape hatch</h2>
        <p id="cookie-consent-description">
          We use essential cookies to keep the site working, remember this choice, and keep
          signed-in sessions secure. Your game progress stays in your browser&apos;s local storage.
          We do not use advertising or third-party tracking cookies.
        </p>
        <p>
          Choose how you want to proceed. You can find the full, less exciting version in our
          Cookies &amp; Privacy page after making your choice.
        </p>
        <div className="cookie-consent__actions">
          <button className="button" onClick={() => choose("essential")}>
            Essential only
          </button>
          <button className="button button--primary" onClick={() => choose("accepted")}>
            Accept all
          </button>
        </div>
      </div>
    </dialog>
  );
}
