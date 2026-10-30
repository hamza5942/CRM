"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { ApiError, apiRequest } from "../../lib/api";
import { useWorkspaceUpdates } from "../../lib/realtime";
import { useAuth } from "../../components/AuthContext";

const STAGES = [
  { value: "new", label: "New lead", color: "bg-sky-500", tint: "bg-sky-50", text: "text-sky-700" },
  { value: "contacted", label: "Contacted", color: "bg-indigo-500", tint: "bg-indigo-50", text: "text-indigo-700" },
  { value: "discovery", label: "Discovery", color: "bg-violet-500", tint: "bg-violet-50", text: "text-violet-700" },
  { value: "proposal", label: "Proposal", color: "bg-amber-500", tint: "bg-amber-50", text: "text-amber-700" },
  { value: "closed", label: "Closed", color: "bg-emerald-500", tint: "bg-emerald-50", text: "text-emerald-700" },
];

const CURRENCY_FORMAT = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const fieldClassName = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

function LeadCard({ lead, onStatusChange, onDelete, pending }) {
  const stage = STAGES.find((item) => item.value === lead.status) || STAGES[0];
  return (
    <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-700`}>{lead.clientName?.[0]?.toUpperCase() || "L"}</span>
          <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-800">{lead.clientName}</h3><p className="truncate text-[11px] text-slate-500">{lead.companyName || lead.email || "No company or email provided"}</p></div>
        </div>
        <button aria-label={`Delete lead ${lead.clientName}`} className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" disabled={pending} onClick={() => onDelete(lead)} type="button"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
      </div>
      <p className="mt-4 text-lg font-semibold tracking-tight text-slate-900">{CURRENCY_FORMAT.format(Number(lead.dealValue) || 0)}</p>
      {lead.notes && <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">{lead.notes}</p>}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="truncate text-[11px] text-slate-500">{lead.email || lead.phone || "No contact details"}</span>
        <label className="sr-only" htmlFor={`lead-status-${lead._id}`}>Stage for {lead.clientName}</label>
        <select className="max-w-32 rounded-full border-0 bg-slate-100 py-1 pl-2.5 pr-7 text-[10px] font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200" disabled={pending} id={`lead-status-${lead._id}`} onChange={(event) => onStatusChange(lead, event.target.value)} value={stage.value}>
          {STAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
    </article>
  );
}

export default function CrmPage() {
  const { session, logout } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingLeadId, setPendingLeadId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formPending, setFormPending] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    clientName: "",
    companyName: "",
    email: "",
    phone: "",
    website: "",
    domainName: "",
    websiteName: "",
    techStack: "",
    websiteProjectStartDate: "",
    websiteProjectEndDate: "",
    dealValue: "",
    notes: "",
  });

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      logout("Your sign-in session has expired. Please sign in again.");
      return;
    }
    setError(requestError instanceof Error ? requestError.message : "The request failed. Please try again.");
  }, [logout]);

  const loadLeads = useCallback(async () => {
    try {
      const result = await apiRequest("leads?limit=100", { token: session.token });
      setLeads(result.leads);
      setError("");
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setLoading(false);
    }
  }, [handleError, session.token]);

  useEffect(() => {
    void Promise.resolve().then(loadLeads);
  }, [loadLeads]);

  useWorkspaceUpdates(session.token, ["leads"], loadLeads);

  const stageLeads = useMemo(() => STAGES.map((stage) => ({
    ...stage,
    leads: leads.filter((lead) => lead.status === stage.value),
    totalValue: leads
      .filter((lead) => lead.status === stage.value)
      .reduce((sum, lead) => sum + (Number(lead.dealValue) || 0), 0),
  })), [leads]);
  const openLeads = leads.filter((lead) => lead.status !== "closed");
  const totalValue = openLeads.reduce((sum, lead) => sum + (Number(lead.dealValue) || 0), 0);
  const closedValue = leads.filter((lead) => lead.status === "closed").reduce((sum, lead) => sum + (Number(lead.dealValue) || 0), 0);

  const createLead = async (event) => {
    event.preventDefault();
    setFormPending(true);
    setError("");
    try {
      const result = await apiRequest("leads", {
        method: "POST",
        token: session.token,
        body: JSON.stringify({
          clientName: form.clientName.trim(),
          companyName: form.companyName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          website: form.website.trim(),
          domainName: form.domainName.trim(),
          websiteName: form.websiteName.trim(),
          techStack: form.techStack.trim(),
          websiteProjectStartDate: form.websiteProjectStartDate || undefined,
          websiteProjectEndDate: form.websiteProjectEndDate || undefined,
          dealValue: form.dealValue === "" ? 0 : Number(form.dealValue),
          notes: form.notes.trim(),
        }),
      });
      setLeads((current) => [result.lead, ...current]);
      setForm({
        clientName: "",
        companyName: "",
        email: "",
        phone: "",
        website: "",
        domainName: "",
        websiteName: "",
        techStack: "",
        websiteProjectStartDate: "",
        websiteProjectEndDate: "",
        dealValue: "",
        notes: "",
      });
      setFormOpen(false);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setFormPending(false);
    }
  };

  const updateLeadStatus = async (lead, status) => {
    setPendingLeadId(lead._id);
    setError("");
    try {
      const result = await apiRequest(`leads/${lead._id}`, {
        method: "PATCH",
        token: session.token,
        body: JSON.stringify({ status }),
      });
      setLeads((current) => current.map((item) => item._id === lead._id ? result.lead : item));
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setPendingLeadId("");
    }
  };

  const deleteLead = async (lead) => {
    setPendingLeadId(lead._id);
    setError("");
    try {
      await apiRequest(`leads/${lead._id}`, { method: "DELETE", token: session.token });
      setLeads((current) => current.filter((item) => item._id !== lead._id));
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setPendingLeadId("");
    }
  };

  return (
    <>
      <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mb-2 text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">Revenue operations</p><h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Sales pipeline</h1><p className="mt-2 text-sm text-slate-500">Manage saved leads and their current stage.</p></div>
        <button className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 sm:self-auto" onClick={() => setFormOpen((open) => !open)} type="button">
          {formOpen ? <X aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}{formOpen ? "Close" : "Add lead"}
        </button>
      </header>

      {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</div>}

      {formOpen && (
        <form className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6" onSubmit={createLead}>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">New lead details</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-medium text-slate-700">Client name<input className={`${fieldClassName} mt-1.5`} onChange={(event) => setForm({ ...form, clientName: event.target.value })} required value={form.clientName} /></label>
            <label className="text-xs font-medium text-slate-700">Company<input className={`${fieldClassName} mt-1.5`} onChange={(event) => setForm({ ...form, companyName: event.target.value })} value={form.companyName} /></label>
            <label className="text-xs font-medium text-slate-700">Email<input className={`${fieldClassName} mt-1.5`} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" value={form.email} /></label>
            <label className="text-xs font-medium text-slate-700">Phone<input className={`${fieldClassName} mt-1.5`} onChange={(event) => setForm({ ...form, phone: event.target.value })} value={form.phone} /></label>
            <label className="text-xs font-medium text-slate-700">Website URL<input className={`${fieldClassName} mt-1.5`} onChange={(event) => setForm({ ...form, website: event.target.value })} placeholder="https://example.com" value={form.website || ""} /></label>
            <label className="text-xs font-medium text-slate-700">Domain name<input className={`${fieldClassName} mt-1.5`} onChange={(event) => setForm({ ...form, domainName: event.target.value })} placeholder="example.com" value={form.domainName || ""} /></label>
            <label className="text-xs font-medium text-slate-700">Website name<input className={`${fieldClassName} mt-1.5`} onChange={(event) => setForm({ ...form, websiteName: event.target.value })} value={form.websiteName || ""} /></label>
            <label className="text-xs font-medium text-slate-700">Tech stack<input className={`${fieldClassName} mt-1.5`} onChange={(event) => setForm({ ...form, techStack: event.target.value })} placeholder="e.g. Next.js, MongoDB" value={form.techStack || ""} /></label>
            <label className="text-xs font-medium text-slate-700">Website project start date<input className={`${fieldClassName} mt-1.5`} onChange={(event) => setForm({ ...form, websiteProjectStartDate: event.target.value })} type="date" value={form.websiteProjectStartDate || ""} /></label>
            <label className="text-xs font-medium text-slate-700">Website project end date<input className={`${fieldClassName} mt-1.5`} onChange={(event) => setForm({ ...form, websiteProjectEndDate: event.target.value })} type="date" value={form.websiteProjectEndDate || ""} /></label>
            <label className="text-xs font-medium text-slate-700">Deal value<input className={`${fieldClassName} mt-1.5`} min="0" onChange={(event) => setForm({ ...form, dealValue: event.target.value })} type="number" value={form.dealValue} /></label>
            <label className="text-xs font-medium text-slate-700 sm:col-span-2 lg:col-span-1">Notes<input className={`${fieldClassName} mt-1.5`} onChange={(event) => setForm({ ...form, notes: event.target.value })} value={form.notes} /></label>
          </div>
          <button className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60" disabled={formPending} type="submit">{formPending ? "Saving…" : "Save lead"}</button>
        </form>
      )}

      <section aria-label="Pipeline summary" className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Open pipeline", value: loading ? "—" : CURRENCY_FORMAT.format(totalValue), detail: "Across open stages" },
          { label: "Open opportunities", value: loading ? "—" : String(openLeads.length), detail: "Not yet closed" },
          { label: "Closed value", value: loading ? "—" : CURRENCY_FORMAT.format(closedValue), detail: "From saved closed leads" },
        ].map((item) => <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40" key={item.label}><p className="text-xs font-medium text-slate-500">{item.label}</p><div className="mt-2 flex items-baseline justify-between gap-2"><p className="text-xl font-semibold tracking-tight text-slate-950">{item.value}</p><p className="text-[11px] text-slate-400">{item.detail}</p></div></div>)}
      </section>

      {loading ? <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">Loading saved leads…</p> : leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
          <h2 className="text-sm font-semibold text-slate-800">No leads yet</h2>
          <p className="mt-1 text-sm text-slate-500">Add a lead to see it in the pipeline.</p>
        </div>
      ) : (
        <section aria-label="Sales pipeline board" className="grid items-start gap-4 pb-4 md:grid-cols-2 xl:grid-cols-5">
          {stageLeads.map((stage) => (
            <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50 transition-shadow hover:shadow-md" key={stage.value}>
              <div className={`h-1.5 ${stage.color}`} />
              <div className="border-b border-slate-100 px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${stage.tint} ${stage.text}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-slate-800">{stage.label}</h2>
                      <p className="mt-0.5 text-[11px] text-slate-500">{stage.leads.length} {stage.leads.length === 1 ? "opportunity" : "opportunities"}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${stage.tint} ${stage.text}`}>{stage.leads.length}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Stage value</span>
                  <span className="text-xs font-semibold text-slate-700">{CURRENCY_FORMAT.format(stage.totalValue)}</span>
                </div>
              </div>
              <div className="min-h-36 space-y-3 bg-slate-50/70 p-2.5">
                {stage.leads.length ? stage.leads.map((lead) => (
                  <div key={lead._id}>
                    <LeadCard lead={lead} onDelete={deleteLead} onStatusChange={updateLeadStatus} pending={pendingLeadId === lead._id} />
                    {(lead.website || lead.domainName || lead.websiteName || lead.techStack || lead.websiteProjectStartDate || lead.websiteProjectEndDate) && (
                      <div className="mt-2 space-y-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-xs shadow-sm shadow-slate-200/30">
                        {lead.website && <p className="truncate"><span className="font-medium text-slate-500">Website: </span>{lead.website}</p>}
                        {lead.domainName && <p className="truncate"><span className="font-medium text-slate-500">Domain: </span>{lead.domainName}</p>}
                        {lead.websiteName && <p className="truncate"><span className="font-medium text-slate-500">Website name: </span>{lead.websiteName}</p>}
                        {lead.techStack && <p className="truncate"><span className="font-medium text-slate-500">Tech stack: </span>{lead.techStack}</p>}
                        {lead.websiteProjectStartDate && <p><span className="font-medium text-slate-500">Project starts: </span>{String(lead.websiteProjectStartDate).slice(0, 10)}</p>}
                        {lead.websiteProjectEndDate && <p><span className="font-medium text-slate-500">Project ends: </span>{String(lead.websiteProjectEndDate).slice(0, 10)}</p>}
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-5 text-center">
                    <span className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full ${stage.tint}`}>
                      <span className={`h-2 w-2 rounded-full ${stage.color}`} />
                    </span>
                    <p className="text-xs font-medium text-slate-600">Nothing here yet</p>
                    <p className="mt-1 text-[11px] text-slate-400">Move a lead into this stage</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
