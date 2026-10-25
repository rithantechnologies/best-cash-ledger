"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  clearRememberedField, currentStaffId, getRemembered,
  matchesRemembered, saveRemembered, suggestionFieldKey,
} from "@/lib/browser-suggestion-history";

type Input = HTMLInputElement | HTMLTextAreaElement;
type Menu = {
  field: string;
  values: string[];
  selected: number;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: "above" | "below";
};

function isInput(el: EventTarget | null): el is Input {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

/**
 * App-owned suggestions stay attached to the focused control, including in
 * scrollable mobile dialogs. Native Chrome/Edge browser popup positioning is
 * outside the web application's control.
 */
export function BrowserEntrySuggestions() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const current = useRef<Input | null>(null);
  const menuRef = useRef<Menu | null>(null);
  const lastKey = useRef<string | null>(null);
  const ignoreNextBlur = useRef<string | null>(null);
  const menuId = "cashledger-entry-suggestions";

  useEffect(() => { menuRef.current = menu; }, [menu]);

  useEffect(() => {
    function close() {
      current.current?.removeAttribute("aria-activedescendant");
      current.current?.removeAttribute("aria-expanded");
      current.current?.removeAttribute("aria-controls");
      menuRef.current = null;
      setMenu(null);
    }
    function render(input: Input, key: string, query: string) {
      if (current.current !== input || !input.isConnected) return close();
      const staff = currentStaffId(localStorage);
      if (!staff) return close();
      const entries = getRemembered(localStorage, staff)[key] || [];
      const values = matchesRemembered(entries, query);
      if (!values.length) return close();
      // When local matches exist, avoid two competing native/app suggestion menus.
      if (!input.hasAttribute("data-entry-original-autocomplete"))
        input.setAttribute("data-entry-original-autocomplete", input.getAttribute("autocomplete") ?? "__absent__");
      input.setAttribute("autocomplete", "off");
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-controls", menuId);
      input.setAttribute("aria-expanded", "true");
      const r = input.getBoundingClientRect();
      const visual = window.visualViewport;
      const viewTop = visual?.offsetTop ?? 0;
      const viewBottom = viewTop + (visual?.height ?? window.innerHeight);
      const below = viewBottom - r.bottom - 8;
      const above = r.top - viewTop - 8;
      const placement = below < 190 && above > below ? "above" : "below";
      const space = placement === "above" ? above : below;
      const maxHeight = Math.max(72, Math.min(185, space - 8));
      const needed = Math.min(maxHeight, values.length * 42 + 66); // compact rows + label + clear control
      const top = placement === "above" ? Math.max(viewTop + 4, r.top - needed - 6) : r.bottom + 6;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 190));
      const width = Math.max(185, Math.min(Math.max(185, r.width), window.innerWidth - left - 8));
      const previous = menuRef.current;
      const selected = previous?.field === key && previous.values.join("|") === values.join("|")
        ? Math.min(previous.selected, values.length - 1) : 0;
      const next: Menu = { field: key, values, selected, left, top, width, maxHeight, placement };
      menuRef.current = next;
      setMenu(next);
      input.setAttribute("aria-activedescendant", menuId + "-" + selected);
    }
    function focus(event: FocusEvent) {
      if (!isInput(event.target)) return;
      const input = event.target;
      const key = suggestionFieldKey(input);
      if (!key) return close();
      current.current = input;
      lastKey.current = key;
      // Focusing a field, including a prefilled field, must not obscure the form.
      // Suggestions appear only after the user edits the field.
      close();
    }
    function type(event: Event) {
      if (!isInput(event.target) || event.target !== current.current) return;
      const key = lastKey.current;
      if (key) render(event.target, key, event.target.value);
    }
    function blur(event: FocusEvent) {
      if (!isInput(event.target) || event.target !== current.current) return;
      const input = event.target;
      const key = lastKey.current;
      const staff = currentStaffId(localStorage);
      if (key && staff && ignoreNextBlur.current !== key) saveRemembered(localStorage, staff, key, input.value);
      ignoreNextBlur.current = null;
      const original = input.getAttribute("data-entry-original-autocomplete");
      if (original !== null) {
        if (original === "__absent__") input.removeAttribute("autocomplete");
        else input.setAttribute("autocomplete", original);
        input.removeAttribute("data-entry-original-autocomplete");
      }
      input.removeAttribute("aria-autocomplete");
      input.removeAttribute("aria-controls");
      input.removeAttribute("aria-expanded");
      input.removeAttribute("aria-activedescendant");
      current.current = null;
      lastKey.current = null;
      close();
    }
    function keydown(event: KeyboardEvent) {
      const active = menuRef.current;
      if (!active || !current.current || event.target !== current.current) return;
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const selected = (active.selected + delta + active.values.length) % active.values.length;
        const next = { ...active, selected };
        menuRef.current = next;
        setMenu(next);
        current.current.setAttribute("aria-activedescendant", menuId + "-" + selected);
        return;
      }
      if (event.key === "Enter" && active.values.length) {
        event.preventDefault();
        selectValue(active.values[active.selected]);
      }
    }
    function selectValue(value: string) {
      const input = current.current;
      if (!input) return;
      // React-controlled inputs require the native setter plus a bubbling input event.
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const staff = currentStaffId(localStorage);
      const key = lastKey.current;
      if (key && staff) saveRemembered(localStorage, staff, key, value);
      close();
      input.focus({ preventScroll: true });
      try { input.setSelectionRange(value.length, value.length); } catch {}
    }
    function updatePosition() {
      const input = current.current, key = lastKey.current;
      if (input && key && menuRef.current) render(input, key, input.value);
    }
    function outside(event: PointerEvent) {
      if (!menuRef.current || !isInput(event.target) || event.target !== current.current) {
        if (!(event.target instanceof Element && event.target.closest("[data-entry-suggestions]"))) close();
      }
    }
    document.addEventListener("focusin", focus);
    document.addEventListener("input", type);
    document.addEventListener("focusout", blur);
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    // Selection from the portal is handled via the custom event to keep this
    // global listener registered only once.
    function choose(event: Event) {
      const value = (event as CustomEvent<{ value: string }>).detail?.value;
      if (typeof value === "string") selectValue(value);
    }
    document.addEventListener("cashledger:choose-suggestion", choose);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("input", type);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
      document.removeEventListener("cashledger:choose-suggestion", choose);
    };
  }, []);

  if (!menu || typeof document === "undefined") return null;
  return createPortal(
    <div
      id={menuId}
      role="listbox"
      aria-label="Previously entered values"
      data-entry-suggestions
      data-placement={menu.placement}
      style={{
        position: "fixed", left: menu.left, top: menu.top,
        width: menu.width, maxHeight: menu.maxHeight, zIndex: 2147483000,
        overflow: "auto", overscrollBehavior: "contain",
        background: "var(--surface, #fff)", color: "var(--text, #111827)",
        border: "1px solid var(--border, #e2e8f0)", borderRadius: 12,
        boxShadow: "0 14px 32px rgba(15,23,42,0.21)",
      }}
    >
      <div style={{ padding: "7px 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted,#64748b)" }}>
        Saved on this browser
      </div>
      {menu.values.map((value, index) => (
        <button
          id={menuId + "-" + index}
          role="option"
          aria-selected={index === menu.selected}
          type="button"
          key={value}
          onPointerDown={e => e.preventDefault()}
          onClick={() => document.dispatchEvent(new CustomEvent("cashledger:choose-suggestion", { detail: { value } }))}
          style={{
            display: "block", width: "100%", minHeight: 42, textAlign: "left",
            padding: "9px 12px", fontSize: 14,
            background: index === menu.selected ? "var(--accent-soft,#eff6ff)" : "transparent",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {value}
        </button>
      ))}
      <button
        type="button"
        onPointerDown={e => e.preventDefault()}
        onClick={() => {
          const staff = currentStaffId(localStorage);
          if (staff) clearRememberedField(localStorage, staff, menu.field);
          ignoreNextBlur.current = menu.field;
          setMenu(null);
          menuRef.current = null;
        }}
        style={{ display: "block", width: "100%", padding: "8px 12px", fontSize: 11, textAlign: "right", color: "var(--text-muted,#64748b)", borderTop: "1px solid var(--border,#e2e8f0)" }}
      >
        Clear suggestions for this field
      </button>
    </div>,
    document.body,
  );
}
