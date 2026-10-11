"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type CustomerIdentity = {
  id: string;
  customerCode: string;
  fullName: string;
  mobile: string | null;
  customerType: string;
};

type Props = {
  field: "name" | "mobile";
  value: string;
  onChange: (next: string) => void;
  onPick: (customer: CustomerIdentity) => void;
  selected: boolean;
  required?: boolean;
};

export function CustomerIdentityAutocomplete({ field, value, onChange, onPick, selected, required }: Props) {
  const [focused, setFocused] = useState(false);
  const [matches, setMatches] = useState<CustomerIdentity[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = field === "mobile" ? value.replace(/\D/g, "") : value.trim();
  const open = focused && !selected && query.length >= 2;
  const listId = "new-customer-" + field + "-matches";
  const labelId = "new-customer-" + field;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiFetch<CustomerIdentity[]>("/customers/autocomplete?field=" + field + "&q=" + encodeURIComponent(query))
        .then((rows) => {
          if (!cancelled) {
            setMatches(rows);
            setFailed(false);
            setActiveIndex(0);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setMatches([]);
            setFailed(true);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [field, query, open]);

  function update(next: string) {
    setMatches([]);
    setLoading(true);
    setFailed(false);
    setActiveIndex(0);
    onChange(next);
  }

  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !matches.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onPick(matches[activeIndex] || matches[0]);
      setFocused(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFocused(false);
    }
  }

  const isMobile = field === "mobile";
  return (
    <div className="relative min-w-0 z-10" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false);
    }}>
      <label htmlFor={labelId} className="mb-1.5 block text-sm font-semibold leading-5 text-[var(--text)]">
        {isMobile ? "Mobile" : "Customer name"}
      </label>
      <input
        id={labelId}
        className="app-control"
        name={isMobile ? "customer_mobile" : "customer_name"}
        type={isMobile ? "tel" : "text"}
        inputMode={isMobile ? "tel" : undefined}
        value={value}
        autoComplete="off"
        placeholder={isMobile ? "Optional" : undefined}
        required={required}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && matches.length ? listId + "-" + activeIndex : undefined}
        onFocus={() => setFocused(true)}
        onChange={(event) => update(isMobile ? event.target.value : event.target.value.toUpperCase())}
        onKeyDown={keyDown}
      />
      {open ? (
        <div id={listId} role="listbox" aria-label={isMobile ? "Matching mobile numbers" : "Matching customer names"}
          className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
          {loading ? <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Searching saved customers…</p> : null}
          {!loading && failed ? <p className="px-3 py-2 text-xs text-rose-600">Could not load suggestions. Please try again.</p> : null}
          {!loading && !failed && !matches.length ?
            <p className="px-3 py-2 text-xs text-[var(--text-muted)]">No existing customer starts with this {isMobile ? "number" : "name"}.</p> : null}
          {!loading && !failed && matches.map((customer, index) => (
            <button key={customer.id} id={listId + "-" + index} type="button" role="option"
              aria-selected={activeIndex === index}
              className={"flex w-full min-w-0 flex-col rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--surface-soft)] " +
                (activeIndex === index ? "bg-[var(--surface-soft)]" : "")}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => { onPick(customer); setFocused(false); }}>
              <span className="truncate font-bold text-[var(--text)]">{isMobile ? customer.mobile || "No mobile" : customer.fullName}</span>
              <span className="truncate text-[var(--text-muted)]">{isMobile ? customer.fullName : customer.mobile || customer.customerCode}</span>
            </button>
          ))}
          {!loading && matches.length === 100 ?
            <p className="px-3 py-1.5 text-[11px] text-[var(--text-muted)]">Showing first 100. Type more to narrow results.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
