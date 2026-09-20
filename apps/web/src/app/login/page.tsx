"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { BrandMark } from "@/components/brand-mark";
import { apiFetch } from "@/lib/api";

type LoginResponse = {
  accessToken: string;
  user: { id: string; fullName: string; email: string; role: string };
};

type FieldName = "email" | "password";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    email: false,
    password: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailError = !email.trim()
    ? "Email is required"
    : !isValidEmail(email.trim())
      ? "Enter a valid email address"
      : "";
  const passwordError = password ? "" : "Password is required";

  const markTouched = (field: FieldName) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError("");

    if (emailError || passwordError) return;

    setLoading(true);
    try {
      const result = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      localStorage.removeItem("cashledger_token");
      localStorage.setItem("cashledger_user", JSON.stringify(result.user));
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(
        /unauthorized|invalid|credentials/i.test(message)
          ? "Invalid email or password"
          : message,
      );
    } finally {
      setLoading(false);
    }
  }

  const showEmailError = (submitted || touched.email) && Boolean(emailError);
  const showPasswordError =
    (submitted || touched.password) && Boolean(passwordError);

  return (
    <main className="min-h-[100svh] bg-[#f4f7ff] text-[#0b1533]">
      <div className="mx-auto grid min-h-[100svh] max-w-[1600px] lg:grid-cols-[minmax(360px,42%)_1fr]">
        <aside className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#10204f_0%,#183786_52%,#4059e8_100%)] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
          <div className="absolute -left-20 top-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-indigo-300/20 blur-3xl" />
          <div className="relative z-10 flex items-center gap-4">
            <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-2xl bg-white/12 shadow-[0_16px_40px_rgba(4,12,42,.28)] backdrop-blur">
              <BrandMark className="h-9 w-9" />
            </span>
            <span className="text-2xl font-bold tracking-[-.025em]">Cash Ledger</span>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-md">
            <div className="rounded-[28px] border border-white/12 bg-white/[.075] p-6 shadow-[0_24px_70px_rgba(4,12,42,.25)] backdrop-blur-sm">
              <div className="mb-5 flex justify-end" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_0_6px_rgba(110,231,183,.12)]" />
              </div>
              <svg viewBox="0 0 420 180" className="w-full" aria-hidden="true">
                <defs>
                  <linearGradient id="login-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#a5b4fc" stopOpacity=".38" />
                    <stop offset="1" stopColor="#a5b4fc" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 145 C55 142 88 112 128 119 C176 128 194 72 246 83 C294 92 326 35 420 24 L420 180 L0 180 Z" fill="url(#login-area)" />
                <path d="M0 145 C55 142 88 112 128 119 C176 128 194 72 246 83 C294 92 326 35 420 24" fill="none" stroke="#c7d2fe" strokeWidth="4" strokeLinecap="round" />
                {[48, 82, 116, 150, 184, 218, 252, 286, 320, 354, 388].map((x, index) => (
                  <rect
                    key={x}
                    x={x}
                    y={148 - index * 7}
                    width="14"
                    height={32 + index * 7}
                    rx="7"
                    fill="rgba(255,255,255,.12)"
                  />
                ))}
              </svg>
            </div>
          </div>

          <span className="relative z-10 h-5" aria-hidden="true" />
        </aside>

        <section className="flex min-h-[100svh] items-center justify-center px-4 py-7 sm:px-8 lg:px-12">
          <div className="w-full max-w-[460px]">
            <div className="mb-7 flex items-center justify-center gap-3 lg:hidden">
              <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(145deg,#3157ee,#5b4ce3)] shadow-[0_12px_28px_rgba(49,87,238,.24)]">
                <BrandMark className="h-8 w-8" />
              </span>
              <span className="text-2xl font-bold tracking-[-.03em]">Cash Ledger</span>
            </div>
            <div className="rounded-[28px] border border-[#e3e8f3] bg-white p-5 shadow-[0_24px_70px_rgba(25,48,103,.10)] sm:p-8">
              <h1 className="text-[2rem] font-black tracking-[-.045em] text-[#0b1533] sm:text-[2.25rem]">
                Sign in
              </h1>

              <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[#293754]">Email</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 grid w-12 place-items-center text-[#7a879e]">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="14" rx="3" />
                        <path d="m5 8 7 5 7-5" />
                      </svg>
                    </span>
                    <input
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      inputMode="email"
                      type="email"
                      value={email}
                      onBlur={() => markTouched("email")}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setError("");
                      }}
                      aria-invalid={showEmailError}
                      aria-describedby={showEmailError ? "email-error" : undefined}
                      className="h-14 w-full rounded-2xl border border-[#dbe3f0] bg-[#fbfcff] pl-12 pr-4 text-base text-[#0b1533] shadow-[inset_0_1px_0_rgba(255,255,255,.7)] placeholder:text-[#9099aa] focus:border-[#5368e8]"
                      placeholder="you@example.com"
                    />
                  </div>
                  {showEmailError ? (
                    <span id="email-error" className="mt-1.5 block text-sm font-medium text-rose-600">
                      {emailError}
                    </span>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[#293754]">Password</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 grid w-12 place-items-center text-[#7a879e]">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <rect x="5" y="10" width="14" height="10" rx="3" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      </svg>
                    </span>
                    <input
                      autoComplete="current-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onBlur={() => markTouched("password")}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError("");
                      }}
                      aria-invalid={showPasswordError}
                      aria-describedby={showPasswordError ? "password-error" : undefined}
                      className="h-14 w-full rounded-2xl border border-[#dbe3f0] bg-[#fbfcff] pl-12 pr-14 text-base text-[#0b1533] shadow-[inset_0_1px_0_rgba(255,255,255,.7)] placeholder:text-[#9099aa] focus:border-[#5368e8]"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute inset-y-0 right-1 grid w-12 place-items-center rounded-xl text-[#64748b] hover:text-[#3047c7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#5368e8]"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                        <circle cx="12" cy="12" r="2.5" />
                        {showPassword ? null : <path d="M4 4 20 20" />}
                      </svg>
                    </button>
                  </div>
                  {showPasswordError ? (
                    <span id="password-error" className="mt-1.5 block text-sm font-medium text-rose-600">
                      {passwordError}
                    </span>
                  ) : null}
                </label>

                {error ? (
                  <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {error}
                  </div>
                ) : null}

                <button
                  disabled={loading}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#3157ee,#4f46e5)] px-4 text-base font-bold text-white shadow-[0_12px_26px_rgba(49,87,238,.24)] transition hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Spinner size="sm" />
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
