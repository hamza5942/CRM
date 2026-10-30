"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, RotateCcw, Trash2, UserPlus, X } from "lucide-react";
import { ApiError, apiRequest } from "../../lib/api";
import { useWorkspaceUpdates } from "../../lib/realtime";
import { useAuth } from "../../components/AuthContext";

const inputClassName = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50";

const emptyCreateForm = { fullName: "", email: "", password: "", confirmPassword: "" };

function normalizeEmployee(user) {
  const id = user?.id ?? user?._id;
  if (typeof id !== "string" || !id) {
    throw new Error("The backend returned an employee without an ID. Restart the backend and reload this page.");
  }
  return { ...user, id };
}

export default function EmployeesPage() {
  const { session, logout } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editForm, setEditForm] = useState({ fullName: "", email: "", password: "" });
  const [createdEmployee, setCreatedEmployee] = useState(null);

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      logout("Your sign-in session has expired. Please sign in again.");
      return;
    }
    setError(requestError instanceof Error ? requestError.message : "The request failed. Please try again.");
  }, [logout]);

  const loadEmployees = useCallback(async () => {
    try {
      const result = await apiRequest("auth/users?includeInactive=true", { token: session.token });
      if (!Array.isArray(result.users)) {
        throw new Error("The backend returned an invalid employee list.");
      }
      setEmployees(result.users.map(normalizeEmployee));
      setError("");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        logout("Your sign-in session has expired. Please sign in again.");
      } else {
        setError(requestError instanceof Error ? requestError.message : "Could not load employees.");
      }
    } finally {
      setLoading(false);
    }
  }, [logout, session.token]);

  useEffect(() => {
    void Promise.resolve().then(loadEmployees);
  }, [loadEmployees]);

  useWorkspaceUpdates(session.token, ["employees"], loadEmployees);

  const createEmployee = async (event) => {
    event.preventDefault();
    setError("");
    setCreatedEmployee(null);

    if (createForm.password !== createForm.confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setPending(true);
    try {
      const result = await apiRequest("auth/register", {
        method: "POST",
        token: session.token,
        body: JSON.stringify({
          fullName: createForm.fullName.trim(),
          email: createForm.email.trim().toLowerCase(),
          password: createForm.password,
          role: "employee",
        }),
      });
      const employee = normalizeEmployee(result.user);
      setEmployees((current) => [...current, employee].sort((left, right) => left.fullName.localeCompare(right.fullName)));
      setCreatedEmployee(employee);
      setCreateForm(emptyCreateForm);
      setCreateOpen(false);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setPending(false);
    }
  };

  const beginEdit = (employee) => {
    if (!employee.id) {
      setError("This employee is missing an account ID. Reload the page after restarting the backend.");
      return;
    }
    setError("");
    setEditingEmployee(employee);
    setEditForm({ fullName: employee.fullName, email: employee.email, password: "" });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editingEmployee) return;

    const updates = {
      fullName: editForm.fullName.trim(),
      email: editForm.email.trim().toLowerCase(),
    };
    if (editForm.password) updates.password = editForm.password;

    setPending(true);
    setError("");
    try {
      const result = await apiRequest(`auth/users/${editingEmployee.id}`, {
        method: "PATCH",
        token: session.token,
        body: JSON.stringify(updates),
      });
      const updatedEmployee = normalizeEmployee(result.user);
      setEmployees((current) => current.map((employee) => employee.id === updatedEmployee.id ? updatedEmployee : employee)
        .sort((left, right) => left.fullName.localeCompare(right.fullName)));
      setEditingEmployee(null);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setPending(false);
    }
  };

  const toggleAccountStatus = async (employee) => {
    if (!employee.id) {
      setError("This employee is missing an account ID. Reload the page after restarting the backend.");
      return;
    }
    const nextActive = employee.isActive === false;
    if (!nextActive && !window.confirm(`Deactivate ${employee.fullName}'s account? They will lose access, but their task and attendance history will be kept.`)) {
      return;
    }

    setPending(true);
    setError("");
    try {
      const result = nextActive
        ? await apiRequest(`auth/users/${employee.id}`, {
          method: "PATCH",
          token: session.token,
          body: JSON.stringify({ isActive: true }),
        })
        : await apiRequest(`auth/users/${employee.id}`, {
          method: "DELETE",
          token: session.token,
        });
      const updatedEmployee = normalizeEmployee(result.user);
      setEmployees((current) => current.map((item) => item.id === employee.id ? updatedEmployee : item));
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setPending(false);
    }
  };

  const deleteEmployee = async (employee) => {
    if (!employee.id) {
      setError("This employee is missing an account ID. Reload the page after restarting the backend.");
      return;
    }
    if (!window.confirm(`Permanently delete ${employee.fullName}'s account? They will lose access. Existing task and attendance records will be kept.`)) {
      return;
    }

    setPending(true);
    setError("");
    setCreatedEmployee(null);
    try {
      await apiRequest(`auth/users/${employee.id}/permanent`, {
        method: "DELETE",
        token: session.token,
      });
      setEmployees((current) => current.filter((item) => item.id !== employee.id));
      if (editingEmployee?.id === employee.id) setEditingEmployee(null);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setPending(false);
    }
  };

  const activeCount = employees.filter((employee) => employee.isActive !== false).length;
  const inactiveCount = employees.length - activeCount;

  return (
    <>
      <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">Team access</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Employees</h1>
          <p className="mt-2 text-sm text-slate-500">Manage employee details and account access. Deactivation can be reversed; permanent deletion keeps task and attendance records.</p>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 sm:self-auto" onClick={() => { setCreateOpen((open) => !open); setError(""); }} type="button">
          {createOpen ? <X aria-hidden="true" className="h-4 w-4" /> : <UserPlus aria-hidden="true" className="h-4 w-4" />}
          {createOpen ? "Close form" : "Add employee"}
        </button>
      </header>

      {error && <p className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700" role="alert">{error}</p>}
      {createdEmployee && (
        <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800" role="status">
          Account created for <strong>{createdEmployee.fullName}</strong> ({createdEmployee.email}). Share the initial password securely.
        </p>
      )}

      {createOpen && (
        <section className="mb-6 max-w-3xl rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><UserPlus aria-hidden="true" className="h-5 w-5" /></span>
            <div><h2 className="text-sm font-semibold text-slate-900">Create employee account</h2><p className="mt-1 text-xs text-slate-500">The employee role is assigned automatically.</p></div>
          </div>
          <form className="grid gap-5 sm:grid-cols-2" onSubmit={createEmployee}>
            <label className="text-sm font-medium text-slate-700" htmlFor="employee-name">Full name<input autoComplete="name" className={`${inputClassName} mt-2`} id="employee-name" onChange={(event) => setCreateForm({ ...createForm, fullName: event.target.value })} placeholder="Employee name" required value={createForm.fullName} /></label>
            <label className="text-sm font-medium text-slate-700" htmlFor="employee-email">Work email<input autoComplete="email" className={`${inputClassName} mt-2`} id="employee-email" onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} placeholder="employee@company.com" required type="email" value={createForm.email} /></label>
            <label className="text-sm font-medium text-slate-700" htmlFor="employee-password">Initial password<input autoComplete="new-password" className={`${inputClassName} mt-2`} id="employee-password" minLength={8} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} required type="password" value={createForm.password} /><span className="mt-1 block text-xs font-normal text-slate-400">At least 8 characters.</span></label>
            <label className="text-sm font-medium text-slate-700" htmlFor="employee-password-confirm">Confirm password<input autoComplete="new-password" className={`${inputClassName} mt-2`} id="employee-password-confirm" minLength={8} onChange={(event) => setCreateForm({ ...createForm, confirmPassword: event.target.value })} required type="password" value={createForm.confirmPassword} /></label>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70 sm:col-span-2 sm:w-fit" disabled={pending} type="submit"><UserPlus aria-hidden="true" className="h-4 w-4" />{pending ? "Creating account…" : "Create employee account"}</button>
          </form>
        </section>
      )}

      <section aria-label="Employee accounts" className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <div><h2 className="text-sm font-semibold text-slate-900">Employee accounts</h2><p className="mt-1 text-xs text-slate-500">{activeCount} active{inactiveCount ? ` · ${inactiveCount} deactivated` : ""}</p></div>
        </div>

        {loading ? <p className="px-6 py-12 text-center text-sm text-slate-500">Loading employee accounts…</p> : employees.length === 0 ? (
          <div className="px-6 py-12 text-center"><p className="text-sm font-medium text-slate-700">No employee accounts yet</p><p className="mt-1 text-sm text-slate-500">Use Add employee to create the first employee login.</p></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {employees.map((employee) => {
              const active = employee.isActive !== false;
              const initials = employee.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
              return (
                <article className={`flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:px-6 ${active ? "" : "bg-slate-50/70"}`} key={employee.id}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">{initials}</span>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{employee.fullName}</p><p className="truncate text-xs text-slate-500">{employee.email}</p></div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{active ? "Active" : "Deactivated"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50" disabled={pending} onClick={() => beginEdit(employee)} type="button"><Pencil aria-hidden="true" className="h-3.5 w-3.5" />Edit</button>
                    <button className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition disabled:opacity-50 ${active ? "border-amber-200 text-amber-800 hover:bg-amber-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`} disabled={pending} onClick={() => toggleAccountStatus(employee)} type="button">
                      {active ? "Deactivate" : <><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />Reactivate</>}
                    </button>
                    <button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50" disabled={pending} onClick={() => deleteEmployee(employee)} type="button"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingEmployee(null); }}>
          <section aria-labelledby="edit-employee-title" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl sm:p-7" role="dialog">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-semibold text-slate-900" id="edit-employee-title">Edit employee</h2><p className="mt-1 text-xs text-slate-500">Leave the password blank to keep the current one.</p></div>
              <button aria-label="Close edit employee form" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => setEditingEmployee(null)} type="button"><X aria-hidden="true" className="h-4 w-4" /></button>
            </div>
            <form className="space-y-4" onSubmit={saveEdit}>
              <label className="block text-sm font-medium text-slate-700" htmlFor="edit-employee-name">Full name<input className={`${inputClassName} mt-2`} id="edit-employee-name" onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })} required value={editForm.fullName} /></label>
              <label className="block text-sm font-medium text-slate-700" htmlFor="edit-employee-email">Email<input className={`${inputClassName} mt-2`} id="edit-employee-email" onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} required type="email" value={editForm.email} /></label>
              <label className="block text-sm font-medium text-slate-700" htmlFor="edit-employee-password">Reset password<input autoComplete="new-password" className={`${inputClassName} mt-2`} id="edit-employee-password" minLength={8} onChange={(event) => setEditForm({ ...editForm, password: event.target.value })} placeholder="Leave blank to keep current password" type="password" value={editForm.password} /></label>
              <div className="flex justify-end gap-2 pt-2">
                <button className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setEditingEmployee(null)} type="button">Cancel</button>
                <button className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60" disabled={pending} type="submit">{pending ? "Saving…" : "Save changes"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
