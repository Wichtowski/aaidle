"use client";

import { useEffect, useState } from "react";
import { FaCookieBite } from "react-icons/fa6";

const consentCookie = "aidle_cookie_consent";

function readConsent() {
  return document.cookie.split("; ").some((entry) => entry.startsWith(`${consentCookie}=`));
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!readConsent());
  }, []);

  const choose = (value: "accepted" | "essential") => {
    document.cookie = `${consentCookie}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`;
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside className="cookie-consent" aria-label="Cookie consent">
      <FaCookieBite aria-hidden focusable="false" />
      <p>
        AIdle uses essential browser storage for your game progress and this preference. We do not
        use advertising cookies.
      </p>
      <div>
        <button className="button" onClick={() => choose("essential")}>
          Only essential
        </button>
        <button className="button button--primary" onClick={() => choose("accepted")}>
          Accept
        </button>
      </div>
    </aside>
  );
}
