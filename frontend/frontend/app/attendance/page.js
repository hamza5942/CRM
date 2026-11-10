"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  FileText,
  Filter,
  ListTodo,
  LogIn,
  LogOut,
  Plus,
  Search,
  User,
  X,
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

const LEAVE_TYPES = [
  { value: "sick", label: "Sick Leave", icon: "🤒", color: "text-rose-700 bg-rose-50 border-rose-200" },
  { value: "casual", label: "Casual Leave", icon: "🌴", color: "text-sky-700 bg-sky-50 border-sky-200" },
  { value: "annual", label: "Annual Leave", icon: "✈️", color: "text-purple-700 bg-purple-50 border-purple-200" },
  { value: "paternity", label: "Paternity Leave", icon: "👶", color: "text-blue-700 bg-blue-50 border-blue-200" },
  { value: "maternity", label: "Maternity Leave", icon: "🤱", color: "text-pink-700 bg-pink-50 border-pink-200" },
  { value: "bereavement", label: "Bereavement Leave", icon: "🕊️", color: "text-slate-700 bg-slate-100 border-slate-300" },
  { value: "unpaid", label: "Unpaid Leave (LWP)", icon: "💼", color: "text-amber-700 bg-amber-50 border-amber-200" },
  { value: "other", label: "Other", icon: "📝", color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
];

function getLeaveTypeMeta(type) {
  return LEAVE_TYPES.find((t) => t.value === type) || {
    value: type,
    label: type ? type.toUpperCase() : "Leave",
    icon: "📋",
    color: "text-slate-700 bg-slate-50 border-slate-200",
  };
}

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

function getUtcYMD(d) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getLocalTodayYMD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
 * MODAL: APPLY FOR LEAVE
 * Rendered conditionally when modalOpen is true.
 * No early returns before hooks to guarantee 100% stable React lifecycle.
 */
function LeaveApplyModal({ onClose, initialDate, token, onSuccess }) {
  const todayYMD = getLocalTodayYMD();
  const validInitial = initialDate && initialDate >= todayYMD ? initialDate : todayYMD;

  const [leaveType, setLeaveType] = useState("sick");
  const [fromDate, setFromDate] = useState(validInitial);
  const [toDate, setToDate] = useState(validInitial);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  let daysCount = 0;
  if (fromDate && toDate) {
    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (end >= start) {
      daysCount = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setModalError("");

    if (fromDate < todayYMD) {
      setModalError("Cannot apply for leave on past dates. Please select today or a future date.");
      return;
    }
    if (toDate < fromDate) {
      setModalError("To date cannot be earlier than from date.");
      return;
    }
    if (!reason.trim() || reason.trim().length < 3) {
      setModalError("Please provide a specific reason for your leave request (at least 3 characters).");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest("leaves", {
        method: "POST",
        token,
        body: JSON.stringify({
          leaveType,
          fromDate,
          toDate,
          reason: reason.trim(),
        }),
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Failed to submit leave request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Apply for Leave</h2>
            <p className="mt-0.5 text-xs text-slate-500">Corporate leave request for manager review</p>
          </div>
          <button
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="p-6 space-y-4" onSubmit={handleSubmit}>
          {modalError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{modalError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">Leave Type</label>
            <select
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              onChange={(e) => setLeaveType(e.target.value)}
              value={leaveType}
            >
              {LEAVE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">From Date</label>
              <input
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                min={todayYMD}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  if (toDate < e.target.value) {
                    setToDate(e.target.value);
                  }
                }}
                required
                type="date"
                value={fromDate}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">To Date</label>
              <input
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                min={fromDate || todayYMD}
                onChange={(e) => setToDate(e.target.value)}
                required
                type="date"
                value={toDate}
              />
            </div>
          </div>

          {daysCount > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-indigo-50/70 border border-indigo-100 px-3.5 py-2 text-xs text-indigo-900 font-medium">
              <span>Duration:</span>
              <span className="font-semibold text-indigo-700">
                {daysCount} {daysCount === 1 ? "day" : "days"} requested
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">Reason for Leave</label>
            <textarea
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please explain the reason for your leave request..."
              required
              rows={3}
              value={reason}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-9 rounded-xl bg-indigo-600 px-5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Submitting…" : "Apply for Leave"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * INTERACTIVE CALENDAR COMPONENT:
 * Month calendar with clickable date cells, color-coded leaves,
 * and bottom pagination.
 */
function InteractiveAttendanceCalendar({ leaves = [], history = [], onSelectDate }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const todayYMD = getLocalTodayYMD();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = new Intl.DateTimeFormat(undefined, { month: "long" }).format(currentDate);

  const prevMonth = (e) => {
    e?.preventDefault();
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = (e) => {
    e?.preventDefault();
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const jumpToday = (e) => {
    e?.preventDefault();
    setCurrentDate(new Date());
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayRaw = new Date(year, month, 1).getDay();
  const startOffset = firstDayRaw === 0 ? 6 : firstDayRaw - 1;

  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    days.push({ dayNumber: i, dateStr: dayStr });
  }

  const findLeaveForDay = (dayStr) => {
    const matches = leaves.filter((leave) => {
      const from = getUtcYMD(leave.fromDate);
      const to = getUtcYMD(leave.toDate);
      return dayStr >= from && dayStr <= to;
    });
    if (!matches.length) return null;
    return matches.sort((a, b) => {
      const score = { approved: 3, pending: 2, rejected: 1 };
      return (score[b.status] || 0) - (score[a.status] || 0);
    })[0];
  };

  const findAttendanceForDay = (dayStr) => {
    return history.find((rec) => getUtcYMD(rec.date) === dayStr);
  };

  const weekHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Attendance & Leave Calendar
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Click any current or future date to apply for leave.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            Pending (Yellow)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Approved (Green)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            Rejected (Red)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70 text-center text-[11px] font-semibold text-slate-500">
        {weekHeaders.map((header) => (
          <div className="py-2.5" key={header}>
            {header}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 text-left">
        {Array.from({ length: startOffset }).map((_, idx) => (
          <div className="min-h-[92px] bg-slate-50/30 p-2 text-slate-300" key={`blank-${idx}`} />
        ))}

        {days.map(({ dayNumber, dateStr }) => {
          const isPast = dateStr < todayYMD;
          const isToday = dateStr === todayYMD;
          const leave = findLeaveForDay(dateStr);
          const att = findAttendanceForDay(dateStr);
          const leaveMeta = leave ? getLeaveTypeMeta(leave.leaveType) : null;

          let cellTheme = "bg-white hover:bg-slate-50/70";
          let badgeTheme = "";

          if (leave) {
            if (leave.status === "pending") {
              cellTheme = "bg-amber-50/70 border-amber-200/80 hover:bg-amber-100/50";
              badgeTheme = "bg-amber-100 text-amber-900 border-amber-300";
            } else if (leave.status === "approved") {
              cellTheme = "bg-emerald-50/70 border-emerald-200/80 hover:bg-emerald-100/50";
              badgeTheme = "bg-emerald-100 text-emerald-900 border-emerald-300";
            } else if (leave.status === "rejected") {
              cellTheme = "bg-rose-50/70 border-rose-200/80 hover:bg-rose-100/50";
              badgeTheme = "bg-rose-100 text-rose-900 border-rose-300";
            }
          }

          const canApply = !isPast;

          return (
            <div
              className={`group relative min-h-[92px] p-2 transition flex flex-col justify-between select-none ${cellTheme} ${
                canApply ? "cursor-pointer" : "cursor-default opacity-85"
              }`}
              key={dateStr}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (canApply) {
                  onSelectDate(dateStr);
                }
              }}
              role="button"
              tabIndex={canApply ? 0 : -1}
              title={
                canApply
                  ? `Click to apply for leave on ${dateStr}`
                  : `Past date (${dateStr}) — leave applications not allowed`
              }
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isToday
                      ? "bg-indigo-600 text-white shadow-xs"
                      : isPast
                      ? "text-slate-400"
                      : "text-slate-700"
                  }`}
                >
                  {dayNumber}
                </span>

                {isToday && (
                  <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider">
                    Today
                  </span>
                )}
              </div>

              <div className="mt-1 space-y-1">
                {leave && (
                  <span
                    className={`inline-flex w-full items-center justify-between gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold border ${badgeTheme}`}
                  >
                    <span className="truncate">
                      {leave.status === "pending"
                        ? "🟡 Pending"
                        : leave.status === "approved"
                        ? "🟢 Approved"
                        : "🔴 Rejected"}
                    </span>
                    <span className="truncate opacity-75">{leaveMeta?.label}</span>
                  </span>
                )}

                {att && att.activeMinutes > 0 && !leave && (
                  <span className="inline-flex w-full items-center gap-1 rounded-md bg-indigo-50/80 border border-indigo-100 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700">
                    <Clock3 className="h-2.5 w-2.5 shrink-0" />
                    <span>{formatDuration(att.activeMinutes)}</span>
                  </span>
                )}
              </div>

              {canApply && !leave && (
                <div className="hidden group-hover:flex items-center justify-end text-[9px] text-indigo-600 font-medium">
                  + Apply
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            onClick={prevMonth}
            type="button"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            onClick={jumpToday}
            type="button"
          >
            Current Month
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            onClick={nextMonth}
            type="button"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="text-xs font-medium text-slate-500">
          Viewing <strong className="text-slate-900">{monthName} {year}</strong> · Click any future date to apply
        </p>
      </div>
    </section>
  );
}

/**
 * EMPLOYEE PERSONAL ATTENDANCE VIEW
 */
function EmployeeAttendanceView({ session, logout, realtimeStatus }) {
  const [history, setHistory] = useState([]);
  const [leaves, setLeaves] = useState([]);
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

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [histRes, leavesRes] = await Promise.all([
        apiRequest("attendance/history", { token: session.token }),
        apiRequest("leaves/my", { token: session.token }),
      ]);
      setHistory(histRes.records || []);
      if (histRes.summary) {
        setSummaryData(histRes.summary);
      }
      setLeaves(leavesRes.leaves || []);
      setError("");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        logout("Your sign-in session has expired. Please sign in again.");
      } else {
        setError(requestError instanceof Error ? requestError.message : "Could not load data.");
      }
    } finally {
      setLoading(false);
    }
  }, [logout, session.token]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData, refreshKey]);

  useWorkspaceUpdates(session.token, ["attendance", "leaves"], loadData);

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

  const handleWithdrawLeave = async (leaveId) => {
    try {
      await apiRequest(`leaves/${leaveId}`, {
        method: "DELETE",
        token: session.token,
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to withdraw leave request.");
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
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">
            {session.designation ? `${session.designation} · Profile` : "My Profile"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">My Attendance</h1>
          <p className="mt-2 text-sm text-slate-500">Your daily attendance history, clock-in/out records, and leave manager.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RealtimeBadge status={realtimeStatus} />
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 px-4 text-xs font-semibold text-indigo-700 shadow-xs hover:border-indigo-300 hover:text-indigo-900 transition"
            onClick={() => {
              setModalDate(getLocalTodayYMD());
              setModalOpen(true);
            }}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            Apply for Leave
          </button>
          <button
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition focus:outline-none disabled:cursor-wait disabled:opacity-60 ${
              isClockedIn ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"
            }`}
            disabled={clockPending || loading}
            onClick={toggleClock}
            type="button"
          >
            {isClockedIn ? <LogOut aria-hidden="true" className="h-3.5 w-3.5" /> : <LogIn aria-hidden="true" className="h-3.5 w-3.5" />}
            {clockPending ? "Saving…" : isClockedIn ? "Clock out" : "Clock in"}
          </button>
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-100 px-3.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-200"
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

      {/* Interactive Month Attendance & Leave Calendar */}
      <InteractiveAttendanceCalendar
        history={history}
        leaves={leaves}
        onSelectDate={(dateStr) => {
          setModalDate(dateStr);
          setModalOpen(true);
        }}
      />

      {/* My Submitted Leave Requests */}
      {leaves.length > 0 && (
        <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <h2 className="text-sm font-semibold text-slate-900">My Leave Applications</h2>
            <p className="mt-0.5 text-xs text-slate-500">Track pending, approved, and rejected leave requests</p>
          </div>
          <div className="divide-y divide-slate-100">
            {leaves.slice(0, 5).map((leave) => {
              const meta = getLeaveTypeMeta(leave.leaveType);
              const fromStr = formatDate(leave.fromDate);
              const toStr = formatDate(leave.toDate);

              return (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:px-6" key={leave._id}>
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-base">
                      {meta.icon}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-800">{meta.label}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                            leave.status === "pending"
                              ? "bg-amber-100 text-amber-900 border-amber-300"
                              : leave.status === "approved"
                              ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                              : "bg-rose-100 text-rose-900 border-rose-300"
                          }`}
                        >
                          {leave.status === "pending"
                            ? "🟡 Pending Review"
                            : leave.status === "approved"
                            ? "🟢 Approved"
                            : "🔴 Rejected"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 font-medium">
                        {fromStr} {fromStr !== toStr ? `→ ${toStr}` : ""}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 italic">&ldquo;{leave.reason}&rdquo;</p>
                      {leave.reviewNotes && (
                        <p className="mt-1 text-[11px] text-slate-600">
                          <strong>Admin Feedback:</strong> {leave.reviewNotes}
                        </p>
                      )}
                    </div>
                  </div>

                  {leave.status === "pending" && (
                    <button
                      className="self-start sm:self-center text-xs font-medium text-rose-600 hover:text-rose-700 transition"
                      onClick={() => handleWithdrawLeave(leave._id)}
                      type="button"
                    >
                      Withdraw Request
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Daily Attendance Logs Table */}
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
                      {record.checkOut ? (
                        <span className="inline-flex items-center gap-1.5">
                          {formatTime(record.checkOut)}
                          {record.autoClockedOut && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 border border-amber-200" title="Auto clocked out when PC turned off or went idle">
                              Auto
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-indigo-600 font-medium">In Progress</span>
                      )}
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

      {/* Conditionally rendered modal: mounts only when open, 0 hook bugs */}
      {modalOpen && (
        <LeaveApplyModal
          initialDate={modalDate}
          onClose={() => setModalOpen(false)}
          onSuccess={() => setRefreshKey((k) => k + 1)}
          token={session.token}
        />
      )}
    </>
  );
}

/**
 * ADMIN ATTENDANCE VIEW
 * Has Three Tabs:
 * - "Team Attendance": Table of employee status & daily active/idle time
 * - "Leave Management": Approve or reject employee leave requests
 * - "Calendar & Leaves": Interactive month calendar view
 */
function AdminAttendanceView({ session, logout, realtimeStatus }) {
  const [activeTab, setActiveTab] = useState("attendance"); // "attendance" | "leaves" | "calendar"

  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [leaves, setLeaves] = useState([]);
  const [leaveCounts, setLeaveCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [leaveFilter, setLeaveFilter] = useState("all");
  const [actionPendingId, setActionPendingId] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState("");

  const loadData = useCallback(async () => {
    try {
      const query = selectedDate ? `?date=${encodeURIComponent(selectedDate)}` : "";
      const [attResult, leavesResult] = await Promise.all([
        apiRequest(`attendance/daily${query}`, { token: session.token }),
        apiRequest("leaves", { token: session.token }),
      ]);
      setEmployees(attResult.employees || []);
      setLeaves(leavesResult.leaves || []);
      if (leavesResult.counts) {
        setLeaveCounts(leavesResult.counts);
      }
      setError("");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        logout("Your sign-in session has expired. Please sign in again.");
      } else {
        setError(requestError instanceof Error ? requestError.message : "Could not load team data.");
      }
    } finally {
      setLoading(false);
    }
  }, [logout, selectedDate, session.token]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData, refreshKey]);

  useWorkspaceUpdates(session.token, ["attendance", "employees", "leaves"], loadData);

  const handleReviewLeave = async (leaveId, status) => {
    setActionPendingId(leaveId);
    setError("");
    try {
      await apiRequest(`leaves/${leaveId}/status`, {
        method: "PATCH",
        token: session.token,
        body: JSON.stringify({ status }),
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${status} leave.`);
    } finally {
      setActionPendingId("");
    }
  };

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter(({ user }) => (
      user?.fullName?.toLowerCase().includes(query) || user?.email?.toLowerCase().includes(query)
    ));
  }, [employees, search]);

  const filteredLeaves = useMemo(() => {
    if (leaveFilter === "all") return leaves;
    return leaves.filter((l) => l.status === leaveFilter);
  }, [leaves, leaveFilter]);

  const checkedInCount = employees.filter((employee) => employee.clockedIn).length;
  const activeCount = employees.filter((employee) => employee.status === "active").length;
  const idleCount = employees.filter((employee) => employee.status === "idle").length;

  const summary = [
    { label: "Employees", value: loading ? "—" : String(employees.length), note: "Registered employee accounts", color: "text-slate-900" },
    { label: "Checked in", value: loading ? "—" : String(checkedInCount), note: "Attendance recorded", color: "text-emerald-700" },
    { label: "Currently active", value: loading ? "—" : String(activeCount), note: "Recent active heartbeats", color: "text-indigo-700" },
    { label: "Pending leaves", value: loading ? "—" : String(leaveCounts.pending), note: "Awaiting your review", color: "text-amber-700" },
  ];

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">People operations</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Team Attendance & Leaves</h1>
          <p className="mt-2 text-sm text-slate-500">Live attendance for employee records and employee leave requests.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RealtimeBadge status={realtimeStatus} />
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 px-4 text-xs font-semibold text-indigo-700 shadow-xs hover:border-indigo-300 hover:text-indigo-900 transition"
            onClick={() => {
              setModalDate(getLocalTodayYMD());
              setModalOpen(true);
            }}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            Apply for Leave
          </button>
        </div>
      </header>

      {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</div>}

      <section aria-label="Team metrics" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40" key={item.label}>
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className={`mt-3 text-2xl font-semibold tracking-tight ${item.color}`}>{item.value}</p>
            <p className="mt-1 text-[11px] text-slate-400">{item.note}</p>
          </div>
        ))}
      </section>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-2 border-b border-slate-200">
        <button
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            activeTab === "attendance"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
          onClick={() => setActiveTab("attendance")}
          type="button"
        >
          <Clock3 className="h-4 w-4" />
          Team Attendance
        </button>

        <button
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            activeTab === "calendar"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
          onClick={() => setActiveTab("calendar")}
          type="button"
        >
          <Calendar className="h-4 w-4" />
          Leave Calendar
        </button>

        <button
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            activeTab === "leaves"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
          onClick={() => setActiveTab("leaves")}
          type="button"
        >
          <CalendarDays className="h-4 w-4" />
          Leave Requests
          {leaveCounts.pending > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              {leaveCounts.pending} Pending
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: TEAM ATTENDANCE */}
      {activeTab === "attendance" && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <div className="flex items-center gap-3">
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

            <label className="relative block w-full sm:w-64">
              <span className="sr-only">Search employees</span>
              <Search aria-hidden="true" className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <input
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employees…"
                type="search"
                value={search}
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="bg-slate-50/80">
                <tr className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                  <th className="px-6 py-3.5">Employee</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Clock In</th>
                  <th className="px-4 py-3.5">Clock Out</th>
                  <th className="px-4 py-3.5">Active Time</th>
                  <th className="px-4 py-3.5">Idle Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && filteredEmployees.map((employee) => {
                  const status = employee.status || "offline";
                  return (
                    <tr className="transition hover:bg-slate-50/70" key={employee.user._id}>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                            {employee.user?.fullName
                              ? employee.user.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
                              : "EM"}
                          </div>
                          <div>
                            <span className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-800">{employee.user?.fullName}</span>
                              {employee.user?.designation && (
                                <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700 border border-indigo-100/80">
                                  {employee.user.designation}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-slate-400">{employee.user?.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium before:h-1.5 before:w-1.5 before:rounded-full ${STATUS_STYLES[status] || STATUS_STYLES.offline}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">{formatTime(employee.checkIn)}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {employee.checkOut ? (
                          <span className="inline-flex items-center gap-1.5">
                            {formatTime(employee.checkOut)}
                            {employee.autoClockedOut && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 border border-amber-200" title="Auto clocked out when PC turned off or went idle">
                                Auto
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
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
      )}

      {/* TAB 2: INTERACTIVE CALENDAR */}
      {activeTab === "calendar" && (
        <InteractiveAttendanceCalendar
          history={[]}
          leaves={leaves}
          onSelectDate={(dateStr) => {
            setModalDate(dateStr);
            setModalOpen(true);
          }}
        />
      )}

      {/* TAB 3: LEAVE MANAGEMENT */}
      {activeTab === "leaves" && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <div className="flex items-center gap-1.5">
              {[
                { id: "all", label: "All Requests", count: leaveCounts.total },
                { id: "pending", label: "Pending", count: leaveCounts.pending },
                { id: "approved", label: "Approved", count: leaveCounts.approved },
                { id: "rejected", label: "Rejected", count: leaveCounts.rejected },
              ].map((f) => (
                <button
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    leaveFilter === f.id
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  key={f.id}
                  onClick={() => setLeaveFilter(f.id)}
                  type="button"
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-500 font-medium">
              Review and approve or reject leave applications
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left">
              <thead className="bg-slate-50/80">
                <tr className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                  <th className="px-6 py-3.5">Employee</th>
                  <th className="px-4 py-3.5">Leave Type</th>
                  <th className="px-4 py-3.5">Requested Dates</th>
                  <th className="px-4 py-3.5">Reason</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && filteredLeaves.map((leave) => {
                  const meta = getLeaveTypeMeta(leave.leaveType);
                  const fromStr = formatDate(leave.fromDate);
                  const toStr = formatDate(leave.toDate);
                  const isPending = leave.status === "pending";
                  const isActioning = actionPendingId === leave._id;

                  return (
                    <tr className="transition hover:bg-slate-50/70" key={leave._id}>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                            {leave.userId?.fullName
                              ? leave.userId.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
                              : "EM"}
                          </div>
                          <div>
                            <span className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-800">{leave.userId?.fullName}</span>
                              {leave.userId?.designation && (
                                <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700 border border-indigo-100/80">
                                  {leave.userId.designation}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-slate-400">{leave.userId?.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${meta.color}`}>
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-700 font-medium">
                        <div>
                          <span>{fromStr}</span>
                          {fromStr !== toStr && <span className="text-slate-400"> → {toStr}</span>}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Applied {formatDate(leave.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 max-w-xs">
                        <p className="line-clamp-2" title={leave.reason}>
                          {leave.reason}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border ${
                            leave.status === "pending"
                              ? "bg-amber-100 text-amber-900 border-amber-300"
                              : leave.status === "approved"
                              ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                              : "bg-rose-100 text-rose-900 border-rose-300"
                          }`}
                        >
                          {leave.status === "pending"
                            ? "🟡 Pending"
                            : leave.status === "approved"
                            ? "🟢 Approved"
                            : "🔴 Rejected"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
                              disabled={isActioning}
                              onClick={() => handleReviewLeave(leave._id, "approved")}
                              type="button"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 transition"
                              disabled={isActioning}
                              onClick={() => handleReviewLeave(leave._id, "rejected")}
                              type="button"
                            >
                              <X className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {leave.reviewedBy?.fullName ? `Reviewed by ${leave.reviewedBy.fullName}` : "Reviewed"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredLeaves.length === 0 && (
                  <tr>
                    <td className="px-6 py-12 text-center text-sm text-slate-500" colSpan={6}>
                      No leave requests found for this filter.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td className="px-6 py-12 text-center text-sm text-slate-500" colSpan={6}>
                      Loading leave requests…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {modalOpen && (
        <LeaveApplyModal
          initialDate={modalDate}
          onClose={() => setModalOpen(false)}
          onSuccess={() => setRefreshKey((k) => k + 1)}
          token={session.token}
        />
      )}
    </>
  );
}

/**
 * Root Attendance Page
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
