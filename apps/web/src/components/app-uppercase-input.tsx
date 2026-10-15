"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type UppercaseField = HTMLInputElement | HTMLTextAreaElement;

function shouldUppercase(target: EventTarget | null): target is UppercaseField {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
  if (target.disabled || target.readOnly || target.closest("[data-preserve-case]")) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  const type = target.type.toLowerCase();
  // Credentials and machine-sensitive values must never be rewritten.
  return ["text", "search"].includes(type) &&
    !["email", "url", "username", "current-password", "new-password", "one-time-code"].includes(target.autocomplete);
}

function uppercaseField(field: UppercaseField) {
  const value = field.value;
  const uppercase = value.toUpperCase();
  if (value === uppercase) return;
  const start = field.selectionStart, end = field.selectionEnd;
  // Use the native setter so React's value tracker can process the same input event.
  const setter = Object.getOwnPropertyDescriptor(
    field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value",
  )?.set;
  setter?.call(field, uppercase);
  if (start !== null && end !== null) {
    try { field.setSelectionRange(value.slice(0, start).toUpperCase().length, value.slice(0, end).toUpperCase().length); } catch {}
  }
}

/** Normalise typed/pasted text before React onChange reads it. Login is untouched. */
export function AppUppercaseInput() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/login" || pathname.startsWith("/login/")) return;
    const onInput = (event: Event) => {
      if ((event as InputEvent).isComposing || !shouldUppercase(event.target)) return;
      uppercaseField(event.target);
    };
    const onSubmit = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      for (const field of Array.from(event.target.querySelectorAll("input,textarea"))) {
        if (shouldUppercase(field)) uppercaseField(field);
      }
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [pathname]);
  return null;
}
