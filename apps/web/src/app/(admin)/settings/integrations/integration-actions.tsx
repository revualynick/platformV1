"use client";

import { useRef, useState, useTransition } from "react";
import type { IntegrationRow } from "@/lib/api";
import { connectPlatform, disconnectPlatform } from "../actions";

// ── Platform-specific config fields ──────────────────────────

function SlackFields() {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Bot Token</label>
        <input
          name="bot_token"
          type="password"
          placeholder="xoxb-..."
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-forest focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Signing Secret</label>
        <input
          name="signing_secret"
          type="password"
          placeholder="Signing secret from Slack app settings"
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-forest focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Workspace Name (optional)</label>
        <input
          name="workspace"
          type="text"
          placeholder="e.g. Acme Corp"
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-forest focus:outline-none"
        />
      </div>
    </>
  );
}

function GoogleChatFields() {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Service Account JSON</label>
        <textarea
          name="service_account_json"
          rows={4}
          placeholder='{"type":"service_account",...}'
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-forest focus:outline-none font-mono"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">GCP Project ID</label>
        <input
          name="project_id"
          type="text"
          placeholder="my-gcp-project"
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-forest focus:outline-none"
        />
      </div>
    </>
  );
}

function TeamsFields() {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">App ID</label>
        <input
          name="app_id"
          type="text"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-forest focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">App Password</label>
        <input
          name="app_password"
          type="password"
          placeholder="Bot Framework app password"
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-forest focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Tenant ID</label>
        <input
          name="tenant_id"
          type="text"
          placeholder="Azure AD tenant ID"
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-forest focus:outline-none"
        />
      </div>
    </>
  );
}

function GoogleCalendarFields() {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">OAuth Client ID</label>
        <input
          name="client_id"
          type="text"
          placeholder="xxxx.apps.googleusercontent.com"
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-forest focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Client Secret</label>
        <input
          name="client_secret"
          type="password"
          placeholder="OAuth client secret"
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-forest focus:outline-none"
        />
      </div>
    </>
  );
}

const platformFields: Record<string, () => React.ReactElement> = {
  slack: SlackFields,
  google_chat: GoogleChatFields,
  teams: TeamsFields,
  google_calendar: GoogleCalendarFields,
};

// ── ConnectDialog ─────────────────────────────────────

interface ConnectDialogProps {
  integration: IntegrationRow;
}

export function ConnectDialog({ integration }: ConnectDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const FieldsComponent = platformFields[integration.platform];

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    // Build config object from form fields (exclude workspace which is top-level)
    const workspace = formData.get("workspace") as string | null;
    const config: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key !== "workspace" && key !== "id" && typeof value === "string" && value.trim()) {
        config[key] = value.trim();
      }
    }

    const actionData = new FormData();
    actionData.set("id", integration.id);
    if (workspace?.trim()) actionData.set("workspace", workspace.trim());
    if (Object.keys(config).length > 0) {
      actionData.set("config", JSON.stringify(config));
    }

    startTransition(async () => {
      const result = await connectPlatform(actionData);
      if (result.ok) {
        setOpen(false);
        formRef.current?.reset();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-forest px-5 py-2.5 text-xs font-medium text-white transition-colors hover:bg-forest-light"
      >
        Connect
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-stone-900">
                Connect {integration.name}
              </h2>
              <button
                onClick={() => { setOpen(false); setError(null); }}
                className="text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {FieldsComponent ? <FieldsComponent /> : null}

              {error && (
                <p className="text-xs text-danger">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setError(null); }}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-xl bg-forest px-4 py-2 text-xs font-medium text-white hover:bg-forest-light disabled:opacity-50"
                >
                  {pending ? "Saving..." : "Save & Connect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── DisconnectButton ──────────────────────────────────

interface DisconnectButtonProps {
  integration: IntegrationRow;
}

export function DisconnectButton({ integration }: DisconnectButtonProps) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDisconnect() {
    setError(null);
    const formData = new FormData();
    formData.set("id", integration.id);

    startTransition(async () => {
      const result = await disconnectPlatform(formData);
      if (result.ok) {
        setConfirm(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className="text-[11px] text-stone-400 hover:text-danger"
      >
        Disconnect
      </button>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-display text-lg font-semibold text-stone-900 mb-2">
              Disconnect {integration.name}?
            </h2>
            <p className="text-sm text-stone-500 mb-5">
              This will remove all credentials and mark the integration as disconnected. You can reconnect at any time.
            </p>

            {error && <p className="text-xs text-danger mb-3">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setConfirm(false); setError(null); }}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                disabled={pending}
                className="rounded-xl bg-danger px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── ConfigureButton ───────────────────────────────────

interface ConfigureButtonProps {
  integration: IntegrationRow;
}

export function ConfigureButton({ integration }: ConfigureButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const FieldsComponent = platformFields[integration.platform];

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    const workspace = formData.get("workspace") as string | null;
    const config: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key !== "workspace" && key !== "id" && typeof value === "string" && value.trim()) {
        config[key] = value.trim();
      }
    }

    const actionData = new FormData();
    actionData.set("id", integration.id);
    if (workspace?.trim()) actionData.set("workspace", workspace.trim());
    if (Object.keys(config).length > 0) {
      actionData.set("config", JSON.stringify(config));
    }

    startTransition(async () => {
      const result = await connectPlatform(actionData);
      if (result.ok) {
        setOpen(false);
        formRef.current?.reset();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50"
      >
        Configure
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-stone-900">
                Configure {integration.name}
              </h2>
              <button
                onClick={() => { setOpen(false); setError(null); }}
                className="text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {FieldsComponent ? <FieldsComponent /> : null}

              {error && (
                <p className="text-xs text-danger">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setError(null); }}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-xl bg-forest px-4 py-2 text-xs font-medium text-white hover:bg-forest-light disabled:opacity-50"
                >
                  {pending ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
