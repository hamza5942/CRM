"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coffee,
  ListTodo,
  LogIn,
  LogOut,
  Search,
} from "lucide-react";
import { ApiError, apiRequest } from "../../lib/api";
import { useWorkspaceUpdates, useRealtimeStatus } from "../../lib/realtime";
import { useAuth } from "../../components/AuthContext";

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700 before:bg-emerald-500",
  idle: "bg-amber-50 text-amber-700 before:bg-amber-500",
  offline: "bg-slate-100 text-slate-600 before:bg-slate-400",
  completed: "bg-emerald-50 text-emerald-700 before:bg-emerald-500",
  in_progress: "bg-indigo-50 text-indigo-700 before:bg-indigo-500",
};

function formatTime(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatDate(dateString) {
  if (!dateString) return "—";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateString));
}

function formatDuration(minutes = 0) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes}m`;
  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
}

/**
 * Live Sync Badge Component
 */
function RealtimeBadge({ status }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
        </span>
        Live Sync Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
      <span className="h-2 w-2 rounded-full bg-amber-500"></span>
      {status === "connecting" ? "Connecting live sync..." : "Live Auto-sync Active"}
    </span>
  );
}

/**
 * ADMIN ATTENDANCE VIEW:
 * Shows the full team's attendance status for today.
 */
function AdminAttendanceView({ session, logout, realtimeStatus }) {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadAttendance = useCallback(async () => {
    try {
      const query = selectedDate ? `?date=${encodeURIComponent(selectedDate)}` : "";
      const result = await apiRequest(`attendance/daily${query}`, { token: session.token });
      setEmployees(result.employees || []);
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
  }, [logout, selectedDate, session.token]);

  useEffect(() => {
    void Promise.resolve().then(loadAttendance);
  }, [loadAttendance, refreshKey]);

  useWorkspaceUpdates(session.token, ["attendance", "employees"], loadAttendance);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter(({ user }) => (
      user?.fullName?.toLowerCase().includes(query) || user?.email?.toLowerCase().includes(query)
    ));
  }, [employees, search]);

  const checkedInCount = employees.filter((employee) => employee.clockedIn).length;
  const activeCount = employees.filter((employee) => employee.status === "active").length;
  const idleCount = employees.filter((employee) => employee.status === "idle").length;
  const today = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
    selectedDate ? new Date(selectedDate) : new Date()
  );

  const summary = [
    { label: "Employees", value: loading ? "—" : String(employees.length), note: "Registered employee accounts", color: "text-slate-900" },
    { label: "Checked in", value: loading ? "—" : String(checkedInCount), note: "Attendance recorded", color: "text-emerald-700" },
    { label: "Currently active", value: loading ? "—" : String(activeCount), note: "Recent active heartbeats", color: "text-indigo-700" },
    { label: "Idle", value: loading ? "—" : String(idleCount), note: "Recent idle heartbeats", color: "text-amber-700" },
  ];

  return (
    <>
      <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">People operations</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Team Attendance</h1>
          <p className="mt-2 text-sm text-slate-500">Live attendance for saved employee records ({today}).</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RealtimeBadge status={realtimeStatus} />
          <input
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            onChange={(e) => setSelectedDate(e.target.value)}
            title="Filter by date"
            type="date"
            value={selectedDate}
          />
          {selectedDate && (
            <button
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              onClick={() => setSelectedDate("")}
              type="button"
            >
              Reset to Today
            </button>
          )}
        </div>
      </header>

      {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</div>}

      <section aria-label="Attendance summary" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40" key={item.label}>
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className={`mt-3 text-2xl font-semibold tracking-tight ${item.color}`}>{item.value}</p>
            <p className="mt-1 text-[11px] text-slate-400">{item.note}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Employee Attendance</h2>
            <p className="mt-1 text-xs text-slate-500">Live check-in times and heartbeat activity</p>
          </div>
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Search employees</span>
            <Search aria-hidden="true" className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <input
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employees..."
              type="search"
              value={search}
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead className="bg-slate-50/80">
              <tr className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                <th className="px-6 py-3.5">Employee</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Check in</th>
                <th className="px-4 py-3.5">Check out</th>
                <th className="px-4 py-3.5">Active samples</th>
                <th className="px-4 py-3.5">Idle samples</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && filteredEmployees.map((employee) => {
                const initials = employee.user?.fullName
                  ? employee.user.fullName
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()
                  : "EM";
                const status = employee.status || "offline";
                return (
                  <tr className="transition hover:bg-slate-50/70" key={employee.user?._id || employee.user?.id}>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-semibold text-indigo-700">
                          {initials}
                        </span>
                        <span>
                          <span className="block text-xs font-semibold text-slate-800">{employee.user?.fullName}</span>
                          <span className="mt-0.5 block text-[10px] text-slate-400">{employee.user?.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium before:h-1.5 before:w-1.5 before:rounded-full ${STATUS_STYLES[status] || STATUS_STYLES.offline}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">{formatTime(employee.checkIn)}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">{formatTime(employee.checkOut)}</td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-700">{formatDuration(employee.activeMinutes)}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">{formatDuration(employee.idleMinutes)}</td>
                  </tr>
                );
              })}
              {!loading && filteredEmployees.length === 0 && (
                <tr>
                  <td className="px-6 py-12 text-center text-sm text-slate-500" colSpan={6}>
                    {employees.length ? "No employees match your search." : "No employee records exist for this date."}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td className="px-6 py-12 text-center text-sm text-slate-500" colSpan={6}>
                    Loading attendance…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-6">
          <p className="text-[11px] text-slate-500">
            {loading
              ? "Loading records…"
              : `Showing ${filteredEmployees.length} of ${employees.length} employees · ${activeCount} active · ${idleCount} idle`}
          </p>
          <button
            className="h-8 rounded-lg border border-slate-200 px-3 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setRefreshKey((key) => key + 1);
            }}
            type="button"
          >
            Refresh
          </button>
        </div>
      </section>
    </>
  );
}

/**
 * EMPLOYEE PERSONAL ATTENDANCE VIEW:
 * Shows the logged-in employee's attendance respective of EACH DAY.
 */
function EmployeeAttendanceView({ session, logout, realtimeStatus }) {
  const [history, setHistory] = useState([]);
  const [summaryData, setSummaryData] = useState({
    totalDaysPresent: 0,
    completedDays: 0,
    totalActiveMinutes: 0,
    totalIdleMinutes: 0,
    averageActiveMinutes: 0,
  });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadMyAttendance = useCallback(async () => {
    try {
      const result = await apiRequest("attendance/history", { token: session.token });
      setHistory(result.records || []);
      if (result.summary) {
        setSummaryData(result.summary);
      }
      setError("");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        logout("Your sign-in session has expired. Please sign in again.");
      } else {
        // Fallback: If /history had an issue, load /attendance/daily
        try {
          const fallback = await apiRequest("attendance/daily", { token: session.token });
          if (fallback.employees && fallback.employees.length) {
            const mapped = fallback.employees.map((emp) => ({
              _id: emp.user?._id || "today",
              date: fallback.date || new Date().toISOString(),
              checkIn: emp.checkIn,
              checkOut: emp.checkOut,
              activeMinutes: emp.activeMinutes || 0,
              idleMinutes: emp.idleMinutes || 0,
              totalMinutes: (emp.activeMinutes || 0) + (emp.idleMinutes || 0),
              status: emp.status,
            }));
            setHistory(mapped);
            setError("");
            return;
          }
        } catch {
          // ignore fallback
        }
        setError(requestError instanceof Error ? requestError.message : "Could not load your attendance.");
      }
    } finally {
      setLoading(false);
    }
  }, [logout, session.token]);

  useEffect(() => {
    void Promise.resolve().then(loadMyAttendance);
  }, [loadMyAttendance, refreshKey]);

  useWorkspaceUpdates(session.token, ["attendance"], loadMyAttendance);

  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return history;
    return history.filter((record) => {
      const dateStr = formatDate(record.date).toLowerCase();
      const statusStr = (record.status || "").toLowerCase();
      return dateStr.includes(query) || statusStr.includes(query);
    });
  }, [history, search]);

  const todayRecord = history.find((record) => {
    const today = new Date();
    const recDate = new Date(record.date);
    return (
      today.getUTCFullYear() === recDate.getUTCFullYear() &&
      today.getUTCMonth() === recDate.getUTCMonth() &&
      today.getUTCDate() === recDate.getUTCDate()
    );
  });

  const isClockedIn = Boolean(todayRecord?.checkIn && !todayRecord?.checkOut);
  const [clockPending, setClockPending] = useState(false);

  const toggleClock = async () => {
    setClockPending(true);
    setError("");
    try {
      const wasClockedIn = isClockedIn;
      await apiRequest(`attendance/${wasClockedIn ? "clock-out" : "clock-in"}`, {
        method: "POST",
        token: session.token,
      });
      if (!wasClockedIn) {
        apiRequest("attendance/heartbeat", {
          method: "POST",
          token: session.token,
          body: JSON.stringify({ status: "active" }),
        }).catch(() => {});
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update clock status.");
    } finally {
      setClockPending(false);
    }
  };

  const cards = [
    {
      label: "Days Present",
      value: loading ? "—" : `${summaryData.totalDaysPresent} days`,
      note: `${summaryData.completedDays} full days completed`,
      icon: CalendarDays,
      color: "text-slate-900",
    },
    {
      label: "Total Active Time",
      value: loading ? "—" : formatDuration(summaryData.totalActiveMinutes),
      note: "Total tracked work hours",
      icon: Clock3,
      color: "text-emerald-700",
    },
    {
      label: "Total Idle Time",
      value: loading ? "—" : formatDuration(summaryData.totalIdleMinutes),
      note: "Inactive system intervals",
      icon: Coffee,
      color: "text-amber-700",
    },
    {
      label: "Today's Status",
      value: loading
        ? "—"
        : todayRecord?.checkOut
        ? "Clocked Out"
        : todayRecord?.checkIn
        ? `In Progress (${formatTime(todayRecord.checkIn)})`
        : "Not Clocked In",
      note: todayRecord?.checkIn ? `Started at ${formatTime(todayRecord.checkIn)}` : "No clock-in today",
      icon: CheckCircle2,
      color: todayRecord?.checkOut
        ? "text-blue-700"
        : todayRecord?.checkIn
        ? "text-emerald-700"
        : "text-slate-500",
    },
  ];

  return (
    <>
      <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">My Profile</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">My Attendance</h1>
          <p className="mt-2 text-sm text-slate-500">Your daily attendance history, clock-in/out records, and active work hours.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RealtimeBadge status={realtimeStatus} />
          <button
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition focus:outline-none disabled:cursor-wait disabled:opacity-60 ${isClockedIn ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
            disabled={clockPending || loading}
            onClick={toggleClock}
            type="button"
          >
            {isClockedIn ? <LogOut aria-hidden="true" className="h-3.5 w-3.5" /> : <LogIn aria-hidden="true" className="h-3.5 w-3.5" />}
            {clockPending ? "Saving…" : isClockedIn ? "Clock out" : "Clock in"}
          </button>
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-100 px-3.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-200"
            href="/tasks"
          >
            <ListTodo aria-hidden="true" className="h-3.5 w-3.5" />
            Daily Portal
          </Link>
        </div>
      </header>

      {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</div>}

      <section aria-label="Attendance statistics" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item) => {
          const Icon = item.icon;
          return (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40" key={item.label}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <Icon aria-hidden="true" className="h-4 w-4 text-slate-400" />
              </div>
              <p className={`mt-3 text-2xl font-semibold tracking-tight ${item.color}`}>{item.value}</p>
              <p className="mt-1 text-[11px] text-slate-400">{item.note}</p>
            </div>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Daily Attendance Log</h2>
            <p className="mt-1 text-xs text-slate-500">Records respective of each working day</p>
          </div>
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Search dates</span>
            <Search aria-hidden="true" className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <input
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by date or status..."
              type="search"
              value={search}
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead className="bg-slate-50/80">
              <tr className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                <th className="px-6 py-3.5">Date</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Clock In</th>
                <th className="px-4 py-3.5">Clock Out</th>
                <th className="px-4 py-3.5">Active Time</th>
                <th className="px-4 py-3.5">Idle Time</th>
                <th className="px-4 py-3.5">Total Tracked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && filteredHistory.map((record) => {
                const status = record.status || (record.checkOut ? "completed" : "in_progress");
                const statusLabel =
                  status === "completed"
                    ? "Completed"
                    : status === "active"
                    ? "Active Now"
                    : status === "idle"
                    ? "Idle"
                    : "In Progress";

                return (
                  <tr className="transition hover:bg-slate-50/70" key={record._id}>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <CalendarDays aria-hidden="true" className="h-4 w-4 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-800">{formatDate(record.date)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium before:h-1.5 before:w-1.5 before:rounded-full ${STATUS_STYLES[status] || STATUS_STYLES.in_progress}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-700 font-medium">{formatTime(record.checkIn)}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {record.checkOut ? formatTime(record.checkOut) : <span className="text-indigo-600 font-medium">In Progress</span>}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-emerald-700">{formatDuration(record.activeMinutes)}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">{formatDuration(record.idleMinutes)}</td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-800">{formatDuration(record.totalMinutes)}</td>
                  </tr>
                );
              })}

              {!loading && filteredHistory.length === 0 && (
                <tr>
                  <td className="px-6 py-12 text-center text-sm text-slate-500" colSpan={7}>
                    {history.length ? "No records match your search." : "You have not recorded any attendance yet."}
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td className="px-6 py-12 text-center text-sm text-slate-500" colSpan={7}>
                    Loading your attendance history…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-6">
          <p className="text-[11px] text-slate-500">
            {loading
              ? "Loading your daily log…"
              : `Showing ${filteredHistory.length} of ${history.length} logged working days`}
          </p>
          <button
            className="h-8 rounded-lg border border-slate-200 px-3 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setRefreshKey((key) => key + 1);
            }}
            type="button"
          >
            Refresh
          </button>
        </div>
      </section>
    </>
  );
}

/**
 * Root Attendance Page:
 * Conditionally renders Admin or Employee attendance view.
 */
export default function AttendancePage() {
  const { session, logout } = useAuth();
  const realtimeStatus = useRealtimeStatus();

  if (!session || !session.role) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-slate-500">Loading attendance…</p>
      </div>
    );
  }

  const role = String(session.role).toLowerCase();

  if (role === "employee") {
    return <EmployeeAttendanceView logout={logout} realtimeStatus={realtimeStatus} session={session} />;
  }

  return <AdminAttendanceView logout={logout} realtimeStatus={realtimeStatus} session={session} />;
}
