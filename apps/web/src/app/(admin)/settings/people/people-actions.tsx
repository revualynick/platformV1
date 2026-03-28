"use client";

import { useState, useRef, useTransition } from "react";
import { addPerson, importPeople, deactivateUserAction, reactivateUserAction } from "../actions";

const VALID_ROLES = ["employee", "manager", "admin", "super_admin"] as const;

interface ParsedPerson {
  email: string;
  name: string;
  role: string;
  timezone: string;
  errors?: string[];
}

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

function validatePerson(p: ParsedPerson): ParsedPerson {
  const errors: string[] = [];
  if (!p.email.includes("@")) errors.push("Invalid email");
  if (!p.name.trim()) errors.push("Missing name");
  if (p.role && !VALID_ROLES.includes(p.role as typeof VALID_ROLES[number])) {
    errors.push(`Invalid role "${p.role}"`);
  }
  return errors.length ? { ...p, errors } : p;
}

function parseCSV(text: string): ParsedPerson[] {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("email") || first.includes("name");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines
    .map((line) => {
      const parts = line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      return validatePerson({
        email: parts[0] || "",
        name: parts[1] || "",
        role: parts[2] || "employee",
        timezone: parts[3] || "UTC",
      });
    })
    .filter((p) => p.email && p.name);
}

function parseTxtMd(text: string): ParsedPerson[] {
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
  return lines
    .map((line) => {
      if (line.includes(",")) {
        const parts = line.split(",").map((s) => s.trim());
        return validatePerson({
          email: parts[0],
          name: parts[1] || "",
          role: parts[2] || "employee",
          timezone: "UTC",
        });
      }
      const parts = line.split(/\s+/);
      const email = parts[0] || "";
      const roleCandidates = ["employee", "manager", "admin"];
      const lastPart = parts[parts.length - 1];
      const role = roleCandidates.includes(lastPart) ? lastPart : "employee";
      const nameParts =
        roleCandidates.includes(lastPart) ? parts.slice(1, -1) : parts.slice(1);
      const name = nameParts.join(" ");
      return validatePerson({ email, name, role, timezone: "UTC" });
    })
    .filter((p) => p.email.includes("@") && p.name);
}

function downloadTemplate() {
  const template =
    "email,name,role,timezone\njane@company.com,Jane Smith,employee,America/New_York\njohn@company.com,John Doe,manager,America/Chicago\n";
  const blob = new Blob([template], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "people-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Add Person Dialog ───────────────────────────────────

interface AddPersonDialogProps {
  currentUserRole?: string;
}

export function AddPersonDialog({ currentUserRole = "admin" }: AddPersonDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addPerson(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        formRef.current?.reset();
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); }}
        className="rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-light"
      >
        + Add Person
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg font-semibold text-stone-900">
                Add Person
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Name <span className="text-terracotta">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="Jane Smith"
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Email <span className="text-terracotta">*</span>
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="jane@company.com"
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Role
                </label>
                <select
                  name="role"
                  defaultValue="employee"
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  {currentUserRole === "super_admin" && (
                    <>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Timezone
                </label>
                <select
                  name="timezone"
                  defaultValue="UTC"
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-light disabled:opacity-60"
                >
                  {isPending ? "Adding…" : "Add Person"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── Deactivate / Reactivate Button ─────────────────────

interface DeactivateButtonProps {
  userId: string;
  isActive: boolean;
  isSelf: boolean;
}

export function DeactivateButton({ userId, isActive, isSelf }: DeactivateButtonProps) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (isSelf) return null;

  function handleConfirm() {
    setError(null);
    const formData = new FormData();
    formData.set("userId", userId);
    startTransition(async () => {
      const result = isActive
        ? await deactivateUserAction(formData)
        : await reactivateUserAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setConfirm(false);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { setConfirm(true); setError(null); }}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
          isActive
            ? "text-terracotta hover:bg-terracotta/10"
            : "text-forest hover:bg-forest/10"
        }`}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </button>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 font-display text-lg font-semibold text-stone-900">
              {isActive ? "Deactivate user?" : "Reactivate user?"}
            </h2>
            <p className="mb-5 text-sm text-stone-500">
              {isActive
                ? "This user will no longer be able to access the platform."
                : "This user will regain access to the platform."}
            </p>

            {error && (
              <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  isActive ? "bg-terracotta hover:bg-terracotta/90" : "bg-forest hover:bg-forest-light"
                }`}
              >
                {isPending ? "Saving..." : isActive ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Import People Dialog ────────────────────────────────

export function ImportPeopleDialog() {
  const [open, setOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<ParsedPerson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleClose() {
    setOpen(false);
    setPasteText("");
    setPreview([]);
    setError(null);
    setResult(null);
  }

  function parseAndPreview(text: string, filename?: string) {
    setError(null);
    setResult(null);
    if (!text.trim()) {
      setPreview([]);
      return;
    }
    const isCSV = !filename || filename.endsWith(".csv");
    const parsed = isCSV ? parseCSV(text) : parseTxtMd(text);
    if (!parsed.length) {
      setError("No valid entries found. Make sure each row has an email and name.");
      setPreview([]);
    } else {
      setPreview(parsed);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setPasteText(text);
      parseAndPreview(text, file.name);
    };
    reader.readAsText(file);
  }

  function handlePasteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setPasteText(text);
    parseAndPreview(text);
  }

  const hasErrors = preview.some((p) => p.errors);

  function handleImport() {
    if (!preview.length || hasErrors) return;
    setError(null);
    startTransition(async () => {
      const res = await importPeople(preview);
      if (!res.ok) {
        setError(res.error);
      } else {
        setResult({ created: res.created ?? 0, skipped: res.skipped ?? 0 });
        setPreview([]);
        setPasteText("");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); }}
        className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
      >
        Import
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg font-semibold text-stone-900">
                Import People
              </h2>
              <button
                onClick={handleClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            {result ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-forest/[0.06] px-5 py-4">
                  <p className="font-semibold text-forest">Import complete</p>
                  <p className="mt-1 text-sm text-stone-600">
                    {result.created} person{result.created !== 1 ? "s" : ""} created
                    {result.skipped > 0 && `, ${result.skipped} skipped (already exist)`}
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="w-full rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-light"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Format instructions */}
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-500 space-y-1">
                  <p className="font-medium text-stone-700">Accepted formats</p>
                  <p>CSV: <code className="rounded bg-stone-200 px-1">email,name,role,timezone</code> (header optional)</p>
                  <p>TXT/MD: one person per line — <code className="rounded bg-stone-200 px-1">email, name, role</code> or space-separated</p>
                </div>

                {/* File upload + template */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl border border-stone-200 bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
                  >
                    Upload file
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.md"
                    onChange={handleFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50"
                  >
                    Download template
                  </button>
                </div>

                {/* Paste area */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-600">
                    Or paste content
                  </label>
                  <textarea
                    value={pasteText}
                    onChange={handlePasteChange}
                    placeholder={"email,name,role,timezone\njane@company.com,Jane Smith,employee,America/New_York"}
                    rows={5}
                    className="w-full rounded-xl border border-stone-200 px-4 py-2.5 font-mono text-xs focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                  />
                </div>

                {/* Preview table */}
                {preview.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-stone-600">
                      Preview — {preview.length} entr{preview.length !== 1 ? "ies" : "y"}
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-stone-200">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-stone-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-stone-500">Email</th>
                            <th className="px-3 py-2 text-left font-medium text-stone-500">Name</th>
                            <th className="px-3 py-2 text-left font-medium text-stone-500">Role</th>
                            <th className="px-3 py-2 text-left font-medium text-stone-500">TZ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {preview.map((p, i) => (
                            <tr key={i} className={p.errors ? "bg-red-50/60" : ""}>
                              <td className="px-3 py-2 text-stone-700">{p.email}</td>
                              <td className="px-3 py-2 text-stone-700">{p.name}</td>
                              <td className={`px-3 py-2 ${p.errors ? "text-red-600 font-medium" : "text-stone-500"}`}>
                                {p.role}
                                {p.errors && <span className="ml-1 text-[10px]">({p.errors.join(", ")})</span>}
                              </td>
                              <td className="px-3 py-2 text-stone-400">{p.timezone}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={!preview.length || hasErrors || isPending}
                    className="flex-1 rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-light disabled:opacity-60"
                  >
                    {isPending ? "Importing…" : `Import ${preview.length > 0 ? preview.length : ""} People`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
