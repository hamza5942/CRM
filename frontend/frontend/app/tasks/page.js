"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Coffee,
  ListTodo,
  LoaderCircle,
  LogIn,
  LogOut,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { ApiError, apiRequest } from "../../lib/api";
import { useWorkspaceUpdates, useRealtimeStatus } from "../../lib/realtime";
import { useAuth } from "../../components/AuthContext";

const IDLE_THRESHOLD_MS = 3 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const TASK_STATUSES = ["pending", "in_progress", "completed"];

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatClockTime(timestamp) {
  if (!timestamp) return "Not clocked in";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function statusClasses(status) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "in_progress") return "bg-indigo-50 text-indigo-700";
  return "bg-slate-100 text-slate-600";
}

export default function EmployeeDailyPortal() {
  const { session, logout } = useAuth();
  const realtimeStatus = useRealtimeStatus();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignedUserId, setAssignedUserId] = useState("");
  const [newTask, setNewTask] = useState("");
  const [attendance, setAttendance] = useState(null);
  const [today, setToday] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const lastActivityRef = useRef(0);

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      logout("Your sign-in session has expired. Please sign in again.");
      return;
    }
    setError(requestError instanceof Error ? requestError.message : "The request failed. Please try again.");
  }, [logout]);

  const loadData = useCallback(async () => {
    try {
      const [taskResult, attendanceResult] = await Promise.all([
        apiRequest("tasks", { token: session.token }),
        apiRequest(session.role === "admin" ? "attendance/daily" : "attendance/today", { token: session.token }),
      ]);
      setTasks(taskResult.tasks.map((task) => ({
        id: task._id,
        title: task.taskTitle,
        status: task.status,
        assignee: task.userId && typeof task.userId === "object" ? task.userId.fullName : "",
        assigneeDesignation: task.userId && typeof task.userId === "object" ? task.userId.designation : "",
      })));
      if (session.role === "admin") {
        const nextEmployees = attendanceResult.employees.map(({ user }) => user);
        setEmployees(nextEmployees);
        setAssignedUserId((current) => current || nextEmployees[0]?._id || "");
      } else {
        setAttendance(attendanceResult.attendance);
      }
      setToday(new Date());
      setError("");
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setLoading(false);
    }
  }, [handleError, session.role, session.token]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  useWorkspaceUpdates(session.token, ["attendance", "employees", "tasks"], loadData);

  const isClockedIn = Boolean(attendance?.checkIn && !attendance.checkOut);
  const attendanceAvailable = session.role === "employee";

  useEffect(() => {
    if (!isClockedIn) {
      return undefined;
    }

    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(attendance.checkIn).getTime()) / 1000)));
    };
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [attendance, isClockedIn]);

  useEffect(() => {
    if (!isClockedIn) return undefined;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };
    if (!lastActivityRef.current) lastActivityRef.current = Date.now();
    window.addEventListener("pointerdown", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });

    const sendHeartbeat = async () => {
      const idle = Date.now() - lastActivityRef.current >= IDLE_THRESHOLD_MS;
      try {
        await apiRequest("attendance/heartbeat", {
          method: "POST",
          token: session.token,
          body: JSON.stringify({ status: idle ? "idle" : "active", source: "web" }),
        });
      } catch (heartbeatError) {
        if (heartbeatError instanceof ApiError && heartbeatError.status === 409) {
          setAttendance((current) => (current ? { ...current, checkOut: new Date() } : current));
        } else {
          handleError(heartbeatError);
        }
      }
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [handleError, isClockedIn, session.token]);

  const createTask = async (event) => {
    event.preventDefault();
    const taskTitle = newTask.trim();
    if (!taskTitle) return;

    setPending(true);
    setError("");
    setSavedMessage("");
    try {
      const result = await apiRequest("tasks", {
        method: "POST",
        token: session.token,
        body: JSON.stringify({
          taskTitle,
          ...(session.role === "admin" ? { userId: assignedUserId } : {}),
        }),
      });
      setTasks((current) => [{
        id: result.task._id,
        title: result.task.taskTitle,
        status: result.task.status,
        assignee: session.role === "admin"
          ? employees.find((employee) => employee._id === assignedUserId)?.fullName || ""
          : session.fullName,
      }, ...current]);
      setNewTask("");
      setSavedMessage("Task saved to your account.");
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setPending(false);
    }
  };

  const updateTaskStatus = async (task, status) => {
    setError("");
    setSavedMessage("");
    try {
      const result = await apiRequest(`tasks/${task.id}`, {
        method: "PATCH",
        token: session.token,
        body: JSON.stringify({ status }),
      });
      setTasks((current) => current.map((item) => (
        item.id === task.id ? { ...item, status: result.task.status } : item
      )));
    } catch (requestError) {
      handleError(requestError);
    }
  };

  const deleteTask = async (taskId) => {
    setError("");
    setSavedMessage("");
    try {
      await apiRequest(`tasks/${taskId}`, { method: "DELETE", token: session.token });
      setTasks((current) => current.filter((task) => task.id !== taskId));
      setSavedMessage("Task deleted.");
    } catch (requestError) {
      handleError(requestError);
    }
  };

  const toggleClock = async () => {
    setPending(true);
    setError("");
    setSavedMessage("");
    try {
      const wasClockedIn = isClockedIn;
      const result = await apiRequest(`attendance/${wasClockedIn ? "clock-out" : "clock-in"}`, {
        method: "POST",
        token: session.token,
      });
      setAttendance(result.attendance);
      setSavedMessage(wasClockedIn ? "Clocked out. Attendance was saved." : "Clocked in. Attendance was saved.");
      lastActivityRef.current = Date.now();
      if (!wasClockedIn) {
        apiRequest("attendance/heartbeat", {
          method: "POST",
          token: session.token,
          body: JSON.stringify({ status: "active" }),
        }).catch(() => {});
      }
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setPending(false);
    }
  };

  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const inProgressCount = tasks.filter((task) => task.status === "in_progress").length;
  const completionPercent = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const activeSeconds = attendance?.totalActiveMinutes
    ? attendance.totalActiveMinutes * 60
    : isClockedIn
      ? elapsedSeconds
      : 0;
  const idleMinutes = attendance?.totalIdleMinutes || 0;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            {session.role === "admin"
              ? "Workspace tasks"
              : session.designation
              ? `${session.designation} · Daily portal`
              : "Employee daily portal"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {session.role === "admin" ? "Team tasks" : `Welcome back, ${session.fullName}`}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {today ? new Intl.DateTimeFormat(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(today) : "Loading date…"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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

          {attendanceAvailable && (
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium ${isClockedIn ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${isClockedIn ? "bg-emerald-500" : "bg-slate-300"}`} />
              {isClockedIn ? "Time tracking active" : "Not clocked in"}
            </div>
          )}
          {attendanceAvailable && (
            <button
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-4 disabled:cursor-wait disabled:opacity-60 ${isClockedIn ? "bg-rose-600 hover:bg-rose-700 focus:ring-rose-100" : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-100"}`}
              disabled={pending || loading}
              onClick={toggleClock}
              type="button"
            >
              {isClockedIn ? <LogOut aria-hidden="true" className="h-4 w-4" /> : <LogIn aria-hidden="true" className="h-4 w-4" />}
              {pending ? "Saving…" : isClockedIn ? "Clock out" : "Clock in"}
            </button>
          )}
        </div>
      </header>

      {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</div>}
      {savedMessage && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{savedMessage}</div>}

      {attendanceAvailable && (
        <section aria-label="Today's attendance and active time" className="mb-6 grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
            <div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Time since clock-in</p><Clock3 aria-hidden="true" className="h-4 w-4 text-indigo-600" /></div>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{formatDuration(activeSeconds)}</p>
            <p className="mt-1 text-[11px] text-slate-400">Based on your saved attendance record</p>
          </article>
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
            <div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Idle minutes</p><Coffee aria-hidden="true" className="h-4 w-4 text-slate-600" /></div>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{idleMinutes}m</p>
            <p className="mt-1 text-[11px] text-slate-400">Recorded heartbeat samples</p>
          </article>
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
            <div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">First clock-in</p><Clock3 aria-hidden="true" className="h-4 w-4 text-emerald-600" /></div>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{formatClockTime(attendance?.checkIn)}</p>
            <p className="mt-1 text-[11px] text-slate-400">{attendance?.checkOut ? `Clocked out ${formatClockTime(attendance.checkOut)}` : attendance?.checkIn ? "Today's attendance record" : "No attendance record yet"}</p>
          </article>
        </section>
      )}

      <section aria-labelledby="daily-tasks-heading" className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><ListTodo aria-hidden="true" className="h-4 w-4 text-indigo-600" /><h2 className="text-base font-semibold text-slate-900" id="daily-tasks-heading">{session.role === "admin" ? "Team tasks" : "Your tasks"}</h2></div>
            <p className="mt-1.5 text-xs text-slate-500">{session.role === "admin" ? "Tasks saved for your employees." : "Tasks are saved to your account."}</p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{completedCount}/{tasks.length} done</span>
        </div>

        <form className="mb-5 flex gap-2" onSubmit={createTask}>
          <label className="sr-only" htmlFor="new-task">Add a task</label>
          <input className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50" id="new-task" onChange={(event) => setNewTask(event.target.value)} placeholder="What needs to get done?" value={newTask} />
          {session.role === "admin" && (
            <label className="sr-only" htmlFor="task-assignee">Assign task to employee</label>
          )}
          {session.role === "admin" && (
            <select className="h-11 max-w-48 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" id="task-assignee" onChange={(event) => setAssignedUserId(event.target.value)} value={assignedUserId}>
              {employees.length ? employees.map((employee) => (
                <option key={employee._id} value={employee._id}>
                  {employee.fullName}{employee.designation ? ` (${employee.designation})` : ""}
                </option>
              )) : <option value="">No employees available</option>}
            </select>
          )}
          <button aria-label="Add task" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={!newTask.trim() || pending || loading || (session.role === "admin" && !assignedUserId)} type="submit">
            <Plus aria-hidden="true" className="h-5 w-5" />
          </button>
        </form>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading your tasks…</p>
        ) : tasks.length > 0 ? (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div aria-label={`${completionPercent}% tasks completed`} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${completionPercent}%` }} /></div>
              <span className="text-[11px] font-medium text-slate-500">{completionPercent}%</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {tasks.map((task) => (
                <li className="flex items-center gap-3 py-3.5 first:pt-1 last:pb-1" key={task.id}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${task.status === "completed" ? "text-emerald-600" : "text-slate-300"}`}>
                    {task.status === "completed" ? <CheckCircle2 aria-hidden="true" className="h-5 w-5" /> : <Circle aria-hidden="true" className="h-5 w-5" />}
                  </span>
                  <span className={`min-w-0 flex-1 text-sm ${task.status === "completed" ? "text-slate-400 line-through" : "text-slate-700"}`}>
                    {task.title}
                    {session.role === "admin" && task.assignee && (
                      <span className="ml-2 text-xs text-slate-400">
                        · {task.assignee}{task.assigneeDesignation ? ` (${task.assigneeDesignation})` : ""}
                      </span>
                    )}
                  </span>
                  <label className="sr-only" htmlFor={`task-status-${task.id}`}>Status for {task.title}</label>
                  <select className={`max-w-32 rounded-full border-0 py-1 pl-2.5 pr-7 text-[10px] font-semibold outline-none focus:ring-2 focus:ring-indigo-200 ${statusClasses(task.status)}`} id={`task-status-${task.id}`} onChange={(event) => updateTaskStatus(task, event.target.value)} value={task.status}>
                    {TASK_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                  </select>
                  <button aria-label={`Delete ${task.title}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" onClick={() => deleteTask(task.id)} type="button"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-9 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm"><Check aria-hidden="true" className="h-5 w-5" /></span>
            <p className="mt-3 text-sm font-medium text-slate-700">No tasks yet</p>
            <p className="mt-1 text-xs text-slate-500">Add a task above to save it to your account.</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5"><Circle aria-hidden="true" className="h-3 w-3" />Pending</span>
          <span className="flex items-center gap-1.5"><LoaderCircle aria-hidden="true" className="h-3 w-3 text-indigo-500" />In progress ({inProgressCount})</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 aria-hidden="true" className="h-3 w-3 text-emerald-500" />Completed</span>
        </div>
      </section>
    </div>
  );
}
