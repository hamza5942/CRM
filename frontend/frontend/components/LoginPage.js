"use client";

import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import CompanyLogo from "./CompanyLogo";

export default function LoginPage({ onLogin, error, isSubmitting }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    await onLogin(email.trim().toLowerCase(), password);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f7f9] px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_-28px_rgba(3,29,48,0.3)] lg:min-h-[620px] lg:grid-cols-[1fr_0.92fr]">
        <section className="relative hidden overflow-hidden bg-[#031d30] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div aria-hidden="true" className="absolute -top-28 -right-32 h-96 w-96 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute -top-12 -right-16 h-64 w-64 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute right-10 bottom-20 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <CompanyLogo className="h-16 w-52" />
          </div>

          <div className="relative max-w-md">
            <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-indigo-300 uppercase">A clearer way to work</p>
            <h1 className="text-4xl leading-tight font-semibold tracking-tight xl:text-[46px]">
              Your team&apos;s day, <span className="text-indigo-300">in focus.</span>
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">
              One workspace for daily priorities, attendance, and the work that moves your team forward.
            </p>
            <div className="mt-10 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><ShieldCheck aria-hidden="true" className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-medium text-white">A workspace for your role</p>
                <p className="mt-1 text-xs text-slate-400">Your access is tailored to your account.</p>
              </div>
            </div>
          </div>

          <p className="relative text-xs text-slate-500">Codex Solutions workspace · Sign in to continue</p>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-12 lg:px-10 xl:px-14">
          <div className="w-full max-w-sm">
            <div className="mb-9 flex items-center gap-3 lg:hidden">
              <CompanyLogo className="h-12 w-40" />
            </div>
            <p className="text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">Welcome back</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Sign in</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Enter your work account details to continue.</p>

            <form className="mt-8 space-y-5" onSubmit={submit}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="login-email">Email address</label>
                <div className="relative">
                  <Mail aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    autoComplete="username"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pr-4 pl-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                    id="login-email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    required
                    type="email"
                    value={email}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700" htmlFor="login-password">Password</label>
                  <span className="text-xs text-slate-400">8 characters</span>
                </div>
                <div className="relative">
                  <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    autoComplete="current-password"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pr-12 pl-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                    id="login-password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                  />
                  <button
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute top-1/2 right-3 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => setShowPassword((visible) => !visible)}
                    type="button"
                  >
                    {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700" role="alert">{error}</p>}

              <button className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-wait disabled:opacity-70" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Signing in…" : "Sign in"} {!isSubmitting && <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </form>

            <p className="mt-7 text-center text-xs leading-5 text-slate-400">
              Need access? Contact your workspace administrator.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
