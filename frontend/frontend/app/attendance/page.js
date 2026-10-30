"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest } from "../../lib/api";
import { useWorkspaceUpdates, useRealtimeStatus } from "../../lib/realtime";
import { useAuth } from "../../components/AuthContext";

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700 before:bg-emerald-500",
  idle: "bg-amber-50 text-amber-700 before:bg-amber-500",
  offline: "bg-slate-100 text-slate-600 before:bg-slate-400",
};

function formatTime(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function formatDuration(minutes = 0) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes}m`;
  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
}

export default function AttendancePage() {
  const { session, logout } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const realtimeStatus = useRealtimeStatus();

  const loadAttendance = useCallback(async () => {
    try {
      const result = await apiRequest("attendance/daily", { token: session.token });
      setEmployees(result.employees);
      setError("");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        logout("Your sign-in session has expired. Please sign in again.");
      } else {
        setError(requestError instanceof Error ? requestError.message : "Could not load attendance.");
      }
    } finally {
      setLoading(false);
    }
  }, [logout, session.token]);

  useEffect(() => {
    void Promise.resolve().then(loadAttendance);
  }, [loadAttendance, refreshKey]);

  useWorkspaceUpdates(session.token, ["attendance", "employees"], loadAttendance);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter(({ user }) => (
      user.fullName.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
    ));
  }, [employees, search]);

  const checkedInCount = employees.filter((employee) => employee.clockedIn).length;
  const activeCount = employees.filter((employee) => employee.status === "active").length;
  const idleCount = employees.filter((employee) => employee.status === "idle").length;
  const today = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date());

  const summary = [
    { label: "Employees", value: loading ? "—" : String(employees.length), note: "Real employee accounts", color: "text-slate-900" },
    { label: "Checked in", value: loading ? "—" : String(checkedInCount), note: "Attendance records today", color: "text-emerald-700" },
    { label: "Currently active", value: loading ? "—" : String(activeCount), note: "Recent active heartbeats", color: "text-indigo-700" },
    { label: "Idle", value: loading ? "—" : String(idleCount), note: "Recent idle heartbeats", color: "text-amber-700" },
  ];

  return (
    <>
      <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">People operations</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Attendance</h1>
          <p className="mt-2 text-sm text-slate-500">Live attendance from saved employee records for {today}.</p>
        </div>
        <div className="flex items-center gap-2">
          {realtimeStatus === "connected" ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              Live Sync Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              {realtimeStatus === "connecting" ? "Connecting live sync..." : "Live Auto-sync Active"}
            </span>
          )}
        </div>
      </header>

      {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</div>}

      <section aria-label="Attendance summary" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40" key={item.label}><p className="text-xs font-medium text-slate-500">{item.label}</p><p className={`mt-3 text-2xl font-semibold tracking-tight ${item.color}`}>{item.value}</p><p className="mt-1 text-[11px] text-slate-400">{item.note}</p></div>)}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
          <div><h2 className="text-sm font-semibold text-slate-900">Today&apos;s attendance</h2><p className="mt-1 text-xs text-slate-500">Current attendance and actual heartbeat totals</p></div>
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Search employees</span>
            <svg aria-hidden="true" className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input className="h-9 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" onChange={(event) => setSearch(event.target.value)} placeholder="Search employees..." type="search" value={search} />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead className="bg-slate-50/80"><tr className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase"><th className="px-6 py-3.5">Employee</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5">Check in</th><th className="px-4 py-3.5">Check out</th><th className="px-4 py-3.5">Active samples</th><th className="px-4 py-3.5">Idle samples</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && filteredEmployees.map((employee) => {
                const initials = employee.user.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
                const status = employee.status || "offline";
                return (
                  <tr className="transition hover:bg-slate-50/70" key={employee.user._id}>
                    <td className="px-6 py-3.5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-semibold text-indigo-700">{initials}</span><span><span className="block text-xs font-semibold text-slate-800">{employee.user.fullName}</span><span className="mt-0.5 block text-[10px] text-slate-400">{employee.user.email}</span></span></div></td>
                    <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium before:h-1.5 before:w-1.5 before:rounded-full ${STATUS_STYLES[status] || STATUS_STYLES.offline}`}>{status}</span></td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">{formatTime(employee.checkIn)}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">{formatTime(employee.checkOut)}</td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-700">{formatDuration(employee.activeMinutes)}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">{formatDuration(employee.idleMinutes)}</td>
                  </tr>
                );
              })}
              {!loading && filteredEmployees.length === 0 && <tr><td className="px-6 py-12 text-center text-sm text-slate-500" colSpan={6}>{employees.length ? "No employees match your search." : "No employee accounts exist yet."}</td></tr>}
              {loading && <tr><td className="px-6 py-12 text-center text-sm text-slate-500" colSpan={6}>Loading attendance…</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-6">
          <p className="text-[11px] text-slate-500">{loading ? "Loading employee records…" : `Showing ${filteredEmployees.length} of ${employees.length} employees · ${activeCount} active · ${idleCount} idle`}</p>
          <button className="h-8 rounded-lg border border-slate-200 px-3 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50" disabled={loading} onClick={() => { setLoading(true); setRefreshKey((key) => key + 1); }} type="button">Refresh</button>
        </div>
      </section>
    </>
  );
}
