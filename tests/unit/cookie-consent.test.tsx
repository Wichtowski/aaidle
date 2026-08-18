// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CookieConsent } from "../../src/app/components/ui/CookieConsent";

const consentCookie = "aaidle_cookie_consent";

describe("CookieConsent", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: function showModal(this: HTMLDialogElement) {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: function close(this: HTMLDialogElement) {
        this.open = false;
        this.dispatchEvent(new Event("close"));
      },
    });
  });

  afterEach(() => {
    document.cookie = `${consentCookie}=; Max-Age=0; Path=/`;
    delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal;
    delete (HTMLDialogElement.prototype as { close?: unknown }).close;
  });

  it("requires an explicit cookie choice and ignores Escape", async () => {
    render(createElement(CookieConsent));

    const dialog = (await screen.findByRole("dialog", {
      name: "Cookies? Cookies! Cookies...",
    })) as HTMLDialogElement;
    await waitFor(() => expect(dialog.open).toBe(true));

    const escape = new Event("cancel", { cancelable: true });
    fireEvent(dialog, escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);

    dialog.close();
    expect(dialog.open).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));

    await waitFor(() => expect(dialog.open).toBe(false));
    expect(document.cookie).toContain(`${consentCookie}=essential`);
  });
});
