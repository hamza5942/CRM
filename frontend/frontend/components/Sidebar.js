"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import CompanyLogo from "./CompanyLogo";
import { useRealtimeStatus } from "../lib/realtime";

const navigation = [
  { label: "Dashboard", href: "/", icon: "grid" },
  { label: "CRM Pipelines", href: "/crm", icon: "pipeline" },
  { label: "Attendance", href: "/attendance", icon: "clock" },
  { label: "Task Sheets", href: "/tasks", icon: "check" },
  { label: "Employees", href: "/employees", icon: "users" },
];

function NavIcon({ name }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    pipeline: <><path d="M4 5h16M7 12h10m-7 7h4" /><circle cx="4" cy="5" r="1" /><circle cx="20" cy="5" r="1" /><circle cx="7" cy="12" r="1" /><circle cx="17" cy="12" r="1" /><circle cx="10" cy="19" r="1" /><circle cx="14" cy="19" r="1" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 3v3m8-3v3M4 9h16m-11 5 2 2 4-4" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  };

  return <svg aria-hidden="true" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function SidebarContents({ pathname, closeMenu, role, email, fullName, onLogout }) {
  const employeeView = role === "employee";
  const realtimeStatus = useRealtimeStatus();
  const visibleNavigation = employeeView
    ? navigation.filter((item) => ["/attendance", "/tasks"].includes(item.href))
    : navigation;

  const isLive = realtimeStatus === "connected";

  return (
    <div className="flex h-full flex-col px-4 py-5">
      <Link aria-label="Codex Solutions home" className="mb-10 flex flex-col items-start gap-2 px-2" href={employeeView ? "/tasks" : "/"} onClick={closeMenu}>
        <CompanyLogo className="h-12 w-44" />
        <span className="text-[11px] font-medium tracking-[0.16em] text-slate-400 uppercase">{employeeView ? "employee workspace" : "admin workspace"}</span>
      </Link>

      <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.2em] text-slate-500 uppercase">{employeeView ? "My workspace" : "Workspace"}</p>
      <nav aria-label={employeeView ? "Employee navigation" : "Main navigation"} className="space-y-1">
        {visibleNavigation.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"}`}
              href={item.href}
              key={item.href}
              onClick={closeMenu}
            >
              <span className={active ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300"}><NavIcon name={item.icon} /></span>
              {item.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-300" />}
            </Link>
          );
        })}
      </nav>


      <div className="mt-5 flex items-center gap-3 border-t border-white/10 px-2 pt-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-400/20 text-xs font-semibold text-indigo-200">{employeeView ? "EM" : "AD"}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-100">{fullName}</p>
          <p className="truncate text-[11px] text-slate-500">{email}</p>
        </div>
        <button aria-label="Sign out" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white" onClick={() => onLogout()} title="Sign out" type="button">
          <LogOut aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({ role, email, fullName, onLogout }) {
  const pathname = usePathname();
  const employeeView = role === "employee";
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#031d30] px-4 md:hidden">
        <Link className="flex items-center gap-2.5" href={employeeView ? "/tasks" : "/"}>
          <CompanyLogo className="h-10 w-40" />
          {employeeView && <span className="sr-only">Employee portal</span>}
        </Link>
        <button aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => setMenuOpen(!menuOpen)} type="button">
          <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            {menuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-[#031d30] md:block"><SidebarContents closeMenu={closeMenu} email={email} fullName={fullName} onLogout={onLogout} pathname={pathname} role={role} /></aside>
      {menuOpen && <button aria-label="Close navigation menu" className="fixed inset-0 z-40 bg-slate-950/40 md:hidden" onClick={closeMenu} type="button" />}
      <aside aria-hidden={!menuOpen} aria-label="Mobile navigation" className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#031d30] transition-transform duration-200 md:hidden ${menuOpen ? "translate-x-0" : "-translate-x-full"}`} inert={!menuOpen}>
        <SidebarContents closeMenu={closeMenu} email={email} fullName={fullName} onLogout={onLogout} pathname={pathname} role={role} />
      </aside>
    </>
  );
}
