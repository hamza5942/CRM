"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, Laptop, LogOut, X } from "lucide-react";
import CompanyLogo from "./CompanyLogo";
import { useRealtimeStatus } from "../lib/realtime";

const DEFAULT_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_TRACKER_DOWNLOAD_URL ||
  "https://github.com/hamza5942/CRM/releases/download/v1.0.0/Employee.Tracker.Setup.1.0.0.exe";

const navigation = [
  { label: "Dashboard", href: "/", icon: "grid" },
  { label: "CRM Pipelines", href: "/crm", icon: "pipeline" },
  { label: "Attendance", href: "/attendance", icon: "clock" },
  { label: "Task Sheets", href: "/tasks", icon: "check" },
  { label: "Employees", href: "/employees", icon: "users" },
];

function NavIcon({ name }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    pipeline: (
      <>
        <path d="M4 5h16M7 12h10m-7 7h4" />
        <circle cx="4" cy="5" r="1" />
        <circle cx="20" cy="5" r="1" />
        <circle cx="7" cy="12" r="1" />
        <circle cx="17" cy="12" r="1" />
        <circle cx="10" cy="19" r="1" />
        <circle cx="14" cy="19" r="1" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    check: (
      <>
        <rect x="4" y="4" width="16" height="17" rx="2" />
        <path d="M8 3v3m8-3v3M4 9h16m-11 5 2 2 4-4" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

function SidebarContents({ pathname, closeMenu, role, email, fullName, designation, onLogout }) {
  const employeeView = role === "employee";
  const realtimeStatus = useRealtimeStatus();
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    try {
      const isInstalled = localStorage.getItem("crm.tracker.installed");
      if (isInstalled !== "true") {
        setInstalled(false);
      }
    } catch {}
  }, []);

  const handleDismiss = () => {
    setInstalled(true);
    try {
      localStorage.setItem("crm.tracker.installed", "true");
    } catch {}
  };

  const visibleNavigation = employeeView
    ? navigation.filter((item) => ["/attendance", "/tasks"].includes(item.href))
    : navigation;

  const isLive = realtimeStatus === "connected";

  return (
    <div className="flex h-full flex-col px-4 py-5">
      {/* Top Header & Logo */}
      <Link
        aria-label="Codex Solutions home"
        className="mb-8 flex flex-col items-start gap-2 px-2"
        href={employeeView ? "/tasks" : "/"}
        onClick={closeMenu}
      >
        <CompanyLogo className="h-12 w-44" />
        <span className="text-[11px] font-medium tracking-[0.16em] text-slate-400 uppercase">
          {employeeView ? "employee workspace" : "admin workspace"}
        </span>
      </Link>

      {/* Navigation */}
      <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.2em] text-slate-500 uppercase">
        {employeeView ? "My workspace" : "Workspace"}
      </p>
      <nav aria-label={employeeView ? "Employee navigation" : "Main navigation"} className="space-y-1">
        {visibleNavigation.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              }`}
              href={item.href}
              key={item.href}
              onClick={closeMenu}
            >
              <span className={active ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300"}>
                <NavIcon name={item.icon} />
              </span>
              {item.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-300" />}
            </Link>
          );
        })}
      </nav>

      {/* Sleek Side Card for Desktop Tracker (Vanishes once installed or dismissed) */}
      {!installed && (
        <div className="my-3 rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 p-3.5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
                <Laptop className="h-4 w-4" />
              </span>
              <span className="text-xs font-semibold text-slate-100">Desktop Tracker</span>
            </div>
            <button
              className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
              onClick={handleDismiss}
              title="Already installed? Dismiss"
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Auto-tracks your active & idle hours in the background.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            <a
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500"
              download="EmployeeTracker-Setup.exe"
              href={DEFAULT_DOWNLOAD_URL}
              onClick={handleDismiss}
            >
              <Download className="h-3.5 w-3.5" />
              Download (.exe)
            </a>
            <button
              className="py-0.5 text-center text-[10px] text-slate-400 transition hover:text-slate-200"
              onClick={handleDismiss}
              type="button"
            >
              Already installed? Hide
            </button>
          </div>
        </div>
      )}

      {/* Docked to the very bottom */}
      <div className="mt-auto space-y-4 pt-4">
        {/* System Status Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-200">System status</p>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
          </div>
          <p className="text-xs text-slate-400">All systems operational</p>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[99.8%] rounded-full bg-emerald-400" />
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Uptime 99.98% · {isLive ? "Live realtime sync" : "Live auto-sync"}
          </p>
        </div>

        {/* User Profile & Logout at Bottom */}
        <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-400/20 text-xs font-semibold text-indigo-200">
            {employeeView ? "EM" : "AD"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-100">{fullName}</p>
            {designation ? (
              <p className="truncate text-[11px] font-medium text-indigo-300">{designation}</p>
            ) : (
              <p className="truncate text-[11px] text-slate-400">{email}</p>
            )}
          </div>
          <a
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
            download="EmployeeTracker-Setup.exe"
            href={DEFAULT_DOWNLOAD_URL}
            title="Download desktop tracker (.exe)"
          >
            <Laptop aria-hidden="true" className="h-4 w-4" />
          </a>
          <button
            aria-label="Sign out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
            onClick={() => onLogout()}
            title="Sign out"
            type="button"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ role, email, fullName, designation, onLogout }) {
  const pathname = usePathname();
  const employeeView = role === "employee";
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#031d30] px-4 md:hidden">
        <Link className="flex items-center gap-2.5" href={employeeView ? "/tasks" : "/"}>
          <CompanyLogo className="h-10 w-40" />
          {employeeView && <span className="sr-only">Employee portal</span>}
        </Link>
        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
          onClick={() => setMenuOpen(!menuOpen)}
          type="button"
        >
          <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            {menuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {/* Desktop Persistent Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-[#031d30] md:block">
        <SidebarContents
          closeMenu={closeMenu}
          designation={designation}
          email={email}
          fullName={fullName}
          onLogout={onLogout}
          pathname={pathname}
          role={role}
        />
      </aside>

      {/* Mobile Drawer */}
      {menuOpen && (
        <button
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-slate-950/40 md:hidden"
          onClick={closeMenu}
          type="button"
        />
      )}
      <aside
        aria-hidden={!menuOpen}
        aria-label="Mobile navigation"
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#031d30] transition-transform duration-200 md:hidden ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        inert={!menuOpen}
      >
        <SidebarContents
          closeMenu={closeMenu}
          designation={designation}
          email={email}
          fullName={fullName}
          onLogout={onLogout}
          pathname={pathname}
          role={role}
        />
      </aside>
    </>
  );
}
