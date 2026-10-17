"use client";
import { useState } from "react";
import { AccountBrandIcon } from "@/components/account-brand-icon";

type BankAccount = { id: string; accountName: string; accountType: string; bankName: string | null };
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function BankAccountImageEditor({ account, version, onChanged }: {
  account: BankAccount; version: number; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function send(method: "POST" | "DELETE", file?: File) {
    setBusy(true);
    setMessage("");
    try {
      const token = localStorage.getItem("cashledger_token");
      const headers = new Headers();
      if (token) headers.set("authorization", "Bearer " + token);
      const form = file ? new FormData() : undefined;
      if (form && file) form.append("image", file);
      const response = await fetch(basePath + "/api/accounts/" + account.id + "/image", {
        method, headers, body: form, credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(Array.isArray(body.message) ? body.message.join(", ") : body.message || "Image update failed");
      }
      setMessage(method === "POST" ? "Image updated." : "Custom image removed. Default logo restored.");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image update failed");
    } finally { setBusy(false); }
  }

  return <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3.5">
    <p className="text-sm font-bold">Bank profile image</p>
    <div className="flex items-center gap-3">
      <AccountBrandIcon key={account.id + ":" + version} account={account} className="!h-14 !w-14 !rounded-2xl"/>
      <p className="text-xs leading-5 text-[var(--text-muted)]">Upload your own logo or photo. Without a custom image, the existing bank logo stays unchanged.</p>
    </div>
    <input aria-label="Choose bank profile image" type="file" accept="image/png,image/jpeg,image/webp"
      disabled={busy} className="block w-full text-xs text-[var(--text)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface)] file:px-3 file:py-2 file:font-bold"
      onChange={async event => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024 || !["image/png","image/jpeg","image/webp"].includes(file.type)) {
          setMessage("Use JPG, PNG or WebP under 2 MB.");event.currentTarget.value="";return;
        }
        event.currentTarget.value="";
        await send("POST",file);
      }}/>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-[var(--text-muted)]">JPG, PNG or WebP · maximum 2 MB</span>
      <button type="button" disabled={busy} onClick={() => send("DELETE")} className="min-h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold disabled:opacity-50">Use default logo</button>
    </div>
    {message && <p role="status" className="text-xs font-medium">{busy ? "Saving…" : message}</p>}
    {busy && <p className="text-xs font-medium">Uploading image…</p>}
  </section>;
}
