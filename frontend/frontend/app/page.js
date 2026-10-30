"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleDollarSign, Users } from "lucide-react";
import { ApiError, apiRequest } from "../lib/api";
import { useWorkspaceUpdates, useRealtimeStatus } from "../lib/realtime";
import { useAuth } from "../components/AuthContext";

const LEAD_STAGES = [
  { value: "new", label: "New lead", color: "bg-sky-500" },
  { value: "contacted", label: "Contacted", color: "bg-indigo-500" },
  { value: "discovery", label: "Discovery", color: "bg-violet-500" },
  { value: "proposal", label: "Proposal", color: "bg-amber-500" },
  { value: "closed", label: "Closed", color: "bg-emerald-500" },
];

const CURRENCY_FORMAT = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function StatusBadge({ status }) {
  const styles = {
    active: "bg-emerald-50 text-emerald-700 before:bg-emerald-500",
    idle: "bg-amber-50 text-amber-700 before:bg-amber-500",
    offline: "bg-slate-100 text-slate-600 before:bg-slate-400",
  };
  const label = status ? `${status[0].toUpperCase()}${status.slice(1)}` : "Unknown";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium before:h-1.5 before:w-1.5 before:rounded-full ${styles[status] || styles.offline}`}>{label}</span>;
}

export default function Home() {
  const { session, logout } = useAuth();
  const realtimeStatus = useRealtimeStatus();
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      const [attendanceResult, taskResult, leadResult] = await Promise.all([
        apiRequest("attendance/live", { token: session.token }),
        apiRequest("tasks?limit=100", { token: session.token }),
        apiRequest("leads?limit=100", { token: session.token }),
      ]);
      setEmployees(attendanceResult.employees);
      setTasks(taskResult.tasks);
      setLeads(leadResult.leads);
      setError("");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        logout("Your sign-in session has expired. Please sign in again.");
      } else {
        setError(requestError instanceof Error ? requestError.message : "Could not load workspace data.");
      }
    } finally {
      setLoading(false);
    }
  }, [logout, session.token]);

  useEffect(() => {
    void Promise.resolve().then(loadDashboard);
  }, [loadDashboard]);

  useWorkspaceUpdates(session.token, ["attendance", "employees", "leads", "tasks"], loadDashboard);

  const activeCount = employees.filter((employee) => employee.status === "active").length;
  const idleCount = employees.filter((employee) => employee.status === "idle").length;
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const completionRate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const openLeads = leads.filter((lead) => lead.status !== "closed");
  const pipelineValue = openLeads.reduce((total, lead) => total + (Number(lead.dealValue) || 0), 0);
  const leadCounts = LEAD_STAGES.map((stage) => ({
    ...stage,
    leads: leads.filter((lead) => lead.status === stage.value),
  }));
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  const metrics = [
    { label: "Active employees", value: loading ? "—" : String(activeCount), detail: `${employees.length} employees in your team`, icon: Users, color: "bg-indigo-50 text-indigo-600" },
    { label: "Task completion", value: loading ? "—" : `${completionRate}%`, detail: `${completedCount} of ${tasks.length} tasks completed`, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
    { label: "Open pipeline", value: loading ? "—" : CURRENCY_FORMAT.format(pipelineValue), detail: `${openLeads.length} open opportunities`, icon: CircleDollarSign, color: "bg-sky-50 text-sky-600" },
  ];

  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">{today}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Welcome back, {session.fullName}</h1>
          <p className="mt-2 text-sm text-slate-500">Here&apos;s what&apos;s happening across your workspace.</p>
        </div>
        <div className="flex items-center gap-3">
          {realtimeStatus === "connected" ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              Live Sync Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              {realtimeStatus === "connecting" ? "Connecting live sync..." : "Live Auto-sync Active"}
            </span>
          )}
          <Link className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:self-auto" href="/employees">
            <Users aria-hidden="true" className="h-4 w-4 text-slate-500" />
            Manage employees
          </Link>
        </div>
      </header>

      {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</div>}

      <section aria-label="Workspace metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6" key={metric.label}>
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-slate-500">{metric.label}</p>
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${metric.color}`}><Icon aria-hidden="true" className="h-4 w-4" /></span>
              </div>
              <div className="mt-5"><p className="text-3xl font-semibold tracking-tight text-slate-950">{metric.value}</p><p className="mt-1 text-xs text-slate-500">{metric.detail}</p></div>
            </article>
          );
        })}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold text-slate-900">Live team activity</h2><p className="mt-1 text-xs text-slate-500">Employee status from current attendance and heartbeats</p></div>
            <Link className="text-xs font-semibold text-indigo-600 hover:text-indigo-700" href="/attendance">View attendance <span aria-hidden="true">→</span></Link>
          </div>
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading live employee data…</p> : employees.length ? (
            <div className="divide-y divide-slate-100">
              {employees.slice(0, 6).map((employee) => (
                <div className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0" key={employee.user._id}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">{employee.user.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{employee.user.fullName}</p><p className="mt-0.5 truncate text-xs text-slate-500">{employee.user.email}</p></div>
                  <StatusBadge status={employee.status} />
                </div>
              ))}
            </div>
          ) : <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No employee accounts found yet. Create an employee account to see team activity.</p>}
          {!loading && employees.length > 0 && <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span><strong className="font-semibold text-slate-700">{activeCount} active</strong> · {idleCount} idle · {employees.length - activeCount - idleCount} offline</span></div>}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div><h2 className="text-base font-semibold text-slate-900">Sales pipeline</h2><p className="mt-1 text-xs text-slate-500">Real leads grouped by stage</p></div>
            <Link className="text-xs font-semibold text-indigo-600 hover:text-indigo-700" href="/crm">View pipeline <span aria-hidden="true">→</span></Link>
          </div>
          <div className="mb-5 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">Total open pipeline value</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{loading ? "—" : CURRENCY_FORMAT.format(pipelineValue)}</p>
          </div>
          {loading ? <p className="py-5 text-center text-sm text-slate-500">Loading leads…</p> : leads.length ? (
            <div className="space-y-4">
              {leadCounts.map((stage) => (
                <div key={stage.value}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-700"><span className={`h-2 w-2 rounded-full ${stage.color}`} />{stage.label}<span className="text-slate-400">{stage.leads.length}</span></div>
                    <span className="text-xs font-semibold text-slate-700">{CURRENCY_FORMAT.format(stage.leads.reduce((sum, lead) => sum + (Number(lead.dealValue) || 0), 0))}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${stage.color}`} style={{ width: `${leads.length ? (stage.leads.length / leads.length) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          ) : <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No leads have been added yet.</p>}
        </div>
      </section>

      <section className="mt-6 flex flex-col justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5 sm:flex-row sm:items-center sm:px-6">
        <div><p className="text-sm font-semibold text-indigo-950">Task progress</p><p className="mt-1 text-xs text-indigo-800/75">{loading ? "Loading task data…" : `${completedCount} of ${tasks.length} tasks completed (${completionRate}%).`}</p></div>
        <Link className="whitespace-nowrap text-xs font-semibold text-indigo-700 hover:text-indigo-900" href="/tasks">Review tasks <span aria-hidden="true">→</span></Link>
      </section>
    </>
  );
}
