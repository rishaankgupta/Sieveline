"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; "expired-callback": () => void; theme: string }): string;
      reset(id?: string): void;
      remove(id: string): void;
    };
  }
}

/**
 * Cloudflare Turnstile bot check. Renders nothing when no site key is configured, so local
 * development works without it. The server enforces the token whenever a secret is configured.
 */
export function Turnstile({ siteKey, nonce, onToken }: { siteKey?: string; nonce?: string; onToken: (t: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  const mount = () => {
    if (!siteKey || !box.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(box.current, {
      sitekey: siteKey,
      theme: "auto",
      callback: (t) => onToken(t),
      "expired-callback": () => onToken(null),
    });
  };

  useEffect(() => {
    mount();
    return () => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" nonce={nonce} onLoad={mount} />
      <div ref={box} className="min-h-[65px]" />
    </>
  );
}
