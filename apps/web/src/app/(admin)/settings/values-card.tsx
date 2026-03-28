"use client";

import { useState, useRef, useTransition } from "react";
import { Modal } from "@/components/modal";
import { addValue, editValue, importValues } from "./actions";

type Value = { id: string; name: string; description: string; active: boolean };

interface ValuesCardProps {
  values: Value[];
}

interface ParsedValue {
  name: string;
  description: string;
}

function parseValuesCSV(text: string): ParsedValue[] {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("name") || first.includes("description");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines
    .map((line) => {
      const parts: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue; }
        if (char === ',' && !inQuotes) { parts.push(current.trim()); current = ""; continue; }
        current += char;
      }
      parts.push(current.trim());
      return { name: parts[0] || "", description: parts[1] || "" };
    })
    .filter((v) => v.name);
}

function parseValuesTxtMd(text: string): ParsedValue[] {
  const lines = text.trim().split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
  return lines
    .map((line) => {
      if (line.includes(",")) {
        const parts = line.split(",").map((s) => s.trim());
        return { name: parts[0], description: parts[1] || "" };
      }
      // "Name - Description" or "Name: Description"
      const sep = line.match(/\s+[-:]\s+/);
      if (sep && sep.index && sep.index > 0) {
        return { name: line.slice(0, sep.index).trim(), description: line.slice(sep.index + sep[0].length).trim() };
      }
      return { name: line.trim(), description: "" };
    })
    .filter((v) => v.name);
}

function downloadValuesTemplate() {
  const template = "name,description\nIntegrity,Acting with honesty and transparency\nCollaboration,Working together across teams\nInnovation,Embracing creative solutions\n";
  const blob = new Blob([template], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "values-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ValuesCard({ values }: ValuesCardProps) {
  const [modalState, setModalState] = useState<
    { mode: "closed" } | { mode: "add" } | { mode: "edit"; value: Value } | { mode: "import" }
  >({ mode: "closed" });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<ParsedValue[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const action = modalState.mode === "add" ? addValue : editValue;
      const result = await action(formData);
      if (result.ok) {
        setModalState({ mode: "closed" });
      } else {
        setError(result.error);
      }
    });
  }

  function parseAndPreviewValues(text: string, filename?: string) {
    setError(null);
    setImportResult(null);
    if (!text.trim()) { setImportPreview([]); return; }
    const isCSV = !filename || filename.endsWith(".csv");
    const parsed = isCSV ? parseValuesCSV(text) : parseValuesTxtMd(text);
    if (!parsed.length) {
      setError("No valid entries found. Each row needs at least a name.");
      setImportPreview([]);
    } else {
      setImportPreview(parsed);
    }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportText(text);
      parseAndPreviewValues(text, file.name);
    };
    reader.readAsText(file);
  }

  function handleImportSubmit() {
    if (!importPreview.length) return;
    setError(null);
    startTransition(async () => {
      const res = await importValues(importPreview);
      if (!res.ok) {
        setError(res.error);
      } else {
        setImportResult({ created: res.created ?? 0, skipped: res.skipped ?? 0 });
        setImportPreview([]);
        setImportText("");
      }
    });
  }

  function closeImport() {
    setModalState({ mode: "closed" });
    setImportText("");
    setImportPreview([]);
    setError(null);
    setImportResult(null);
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-stone-800">
          Core Values
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalState({ mode: "import" })}
            className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-200"
          >
            Import
          </button>
          <button
            onClick={() => setModalState({ mode: "add" })}
            className="rounded-xl bg-forest/[0.06] px-4 py-2 text-xs font-medium text-forest hover:bg-forest/10"
          >
            + Add Value
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {values.map((value, i) => (
          <div
            key={value.id}
            className="group flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-stone-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest/[0.06] text-xs font-bold text-forest">
              {i + 1}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-800">
                {value.name}
              </p>
              <p className="text-xs text-stone-400">{value.description}</p>
            </div>
            <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => setModalState({ mode: "edit", value })}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Import Modal */}
      {modalState.mode === "import" && (
        <Modal open onClose={closeImport} title="Import Core Values">
          {importResult ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-forest/[0.06] px-5 py-4">
                <p className="font-semibold text-forest">Import complete</p>
                <p className="mt-1 text-sm text-stone-600">
                  {importResult.created} value{importResult.created !== 1 ? "s" : ""} created
                  {importResult.skipped > 0 && `, ${importResult.skipped} skipped (already exist)`}
                </p>
              </div>
              <button
                onClick={closeImport}
                className="w-full rounded-xl bg-forest px-4 py-2 text-xs font-medium text-white hover:bg-forest-light"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-500 space-y-1">
                <p className="font-medium text-stone-700">Accepted formats</p>
                <p>CSV: <code className="rounded bg-stone-200 px-1">name,description</code> (header optional)</p>
                <p>TXT/MD: one value per line — <code className="rounded bg-stone-200 px-1">Name - Description</code> or <code className="rounded bg-stone-200 px-1">Name: Description</code></p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-stone-200 bg-stone-100 px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200"
                >
                  Upload file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.md"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={downloadValuesTemplate}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                >
                  Download template
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Or paste content
                </label>
                <textarea
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    parseAndPreviewValues(e.target.value);
                  }}
                  placeholder={"name,description\nIntegrity,Acting with honesty\nCollaboration,Working together"}
                  rows={4}
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 font-mono text-xs focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                />
              </div>

              {importPreview.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-stone-600">
                    Preview — {importPreview.length} value{importPreview.length !== 1 ? "s" : ""}
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-stone-200">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-stone-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-stone-500">Name</th>
                          <th className="px-3 py-2 text-left font-medium text-stone-500">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {importPreview.map((v, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-medium text-stone-700">{v.name}</td>
                            <td className="px-3 py-2 text-stone-500">{v.description || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-600">{error}</p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeImport}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={!importPreview.length || isPending}
                  className="rounded-xl bg-forest px-4 py-2 text-xs font-medium text-white hover:bg-forest-light disabled:opacity-50"
                >
                  {isPending ? "Importing…" : `Import ${importPreview.length > 0 ? importPreview.length : ""} Values`}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Add / Edit Modal */}
      {(modalState.mode === "add" || modalState.mode === "edit") && (
        <Modal
          open
          onClose={() => { setModalState({ mode: "closed" }); setError(null); }}
          title={modalState.mode === "add" ? "Add Value" : "Edit Value"}
        >
          <form action={handleSubmit}>
            {modalState.mode === "edit" && (
              <input type="hidden" name="id" value={modalState.value.id} />
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={modalState.mode === "edit" ? modalState.value.name : ""}
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  placeholder="e.g. Integrity"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={modalState.mode === "edit" ? modalState.value.description : ""}
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  placeholder="Brief description of this value"
                />
              </div>
            </div>
            {error && (
              <p className="mt-3 text-xs text-danger">{error}</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setModalState({ mode: "closed" }); setError(null); }}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-forest shadow-[0_8px_20px_rgba(61,24,55,0.25)] px-4 py-2 text-xs font-medium text-white hover:bg-forest-light disabled:opacity-50"
              >
                {isPending ? "Saving..." : modalState.mode === "add" ? "Add Value" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
