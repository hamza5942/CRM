"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import LoginPage from "./LoginPage";
import { AuthContext } from "./AuthContext";
import { apiRequest } from "../lib/api";

const SESSION_STORAGE_KEY = "codex.auth.session.v1";
const LEGACY_SESSION_STORAGE_KEY = "northstar.auth.session";
const VALID_ROLES = ["admin", "employee"];
const EMPLOYEE_PATHS = ["/attendance", "/tasks"];

function isValidSession(value) {
  return value
    && typeof value.token === "string"
    && value.token.length > 0
    && value.authenticated === true
    && VALID_ROLES.includes(value.role)
    && typeof value.fullName === "string"
    && typeof value.email === "string";
}

export default function AuthShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [loginPending, setLoginPending] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidSession(parsed)) {
          // Read browser-only session data after hydration to keep server markup deterministic.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSession(parsed);
        } else {
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    } catch {
      setError("We couldn't access this browser's login session. Please enable session storage and try again.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!session) {
      if (pathname !== "/") router.replace("/");
      return;
    }

    if (session.role === "employee" && !EMPLOYEE_PATHS.includes(pathname)) {
      router.replace("/tasks");
      return;
    }

    if (pathname === "/") {
      if (session.role === "employee") router.replace("/tasks");
    }
  }, [loaded, pathname, router, session]);

  const login = useCallback(async (email, password) => {
    setError("");
    setLoginPending(true);
    try {
      const result = await apiRequest("auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (
        typeof result.token !== "string" ||
        !result.user ||
        !VALID_ROLES.includes(result.user.role) ||
        typeof result.user.fullName !== "string" ||
        typeof result.user.email !== "string"
      ) {
        throw new Error("The backend returned an invalid login response.");
      }

      const nextSession = {
        authenticated: true,
        token: result.token,
        role: result.user.role,
        fullName: result.user.fullName,
        email: result.user.email,
      };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      router.replace(result.user.role === "admin" ? "/" : "/tasks");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign in failed. Please try again.");
    } finally {
      setLoginPending(false);
    }
  }, [router]);

  const logout = useCallback((message = "") => {
    const feedback = typeof message === "string" ? message : "";
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      setSession(null);
      setError(feedback);
      router.replace("/");
    } catch {
      setError("We couldn't end your browser session. Please try again.");
    }
  }, [router]);

  if (!loaded) {
    return <div aria-label="Loading workspace" className="min-h-screen bg-slate-50" role="status" />;
  }

  if (!session) {
    return (
      <LoginPage
        error={error}
        isSubmitting={loginPending}
        onLogin={login}
      />
    );
  }

  if (session.role === "employee" && !EMPLOYEE_PATHS.includes(pathname)) {
    return <div aria-label="Opening your workspace" className="min-h-screen bg-slate-50" role="status" />;
  }

  return (
    <AuthContext.Provider value={{ session, logout }}>
      <Sidebar email={session.email} fullName={session.fullName} onLogout={logout} role={session.role} />
      <main className="min-h-screen md:pl-64">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">{children}</div>
      </main>
    </AuthContext.Provider>
  );
}
