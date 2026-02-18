"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import type { OneOnOneSessionDetail, OneOnOneActionItem, OneOnOneAgendaItem } from "@/lib/api";

interface SessionEditorProps {
  session: OneOnOneSessionDetail;
  currentUserId: string;
  employeeName: string;
  wsUrl: string | null;
  wsToken: string | null;
  startAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  endAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  addActionItemAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  toggleActionItemAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  deleteActionItemAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  addAgendaItemAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  toggleAgendaItemAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  generateAgendaAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  saveNotesAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
}

export function SessionEditor({
  session,
  currentUserId,
  employeeName,
  wsUrl,
  wsToken,
  startAction,
  endAction,
  addActionItemAction,
  toggleActionItemAction,
  deleteActionItemAction,
  addAgendaItemAction,
  toggleAgendaItemAction,
  generateAgendaAction,
  saveNotesAction,
}: SessionEditorProps) {
  const [notes, setNotes] = useState(session.notes);
  const [employeeConnected, setEmployeeConnected] = useState(false);
  const [editRequest, setEditRequest] = useState(false);
  const [newActionText, setNewActionText] = useState("");
  const [newAgendaText, setNewAgendaText] = useState("");
  const [isPending, startTransition] = useTransition();
  const wsRef = useRef<WebSocket | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = session.status === "active";
  const isScheduled = session.status === "scheduled";
  const isCompleted = session.status === "completed";

  // WebSocket connection for active sessions
  useEffect(() => {
    if (!isActive || !wsUrl || !wsToken) return;

    const ws = new WebSocket(wsUrl, ["revualy-ws", wsToken]);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== "string") return;
      switch (msg.type) {
        case "presence":
          if (typeof msg.employeeConnected !== "boolean") return;
          setEmployeeConnected(msg.employeeConnected);
          break;
        case "edit_request":
          setEditRequest(true);
          setTimeout(() => setEditRequest(false), 5000);
          break;
        case "content_sync":
          if (typeof msg.content !== "string") return;
          // Manager is the writer, so this is just for reconnection
          if (msg.content && !notes) {
            setNotes(msg.content);
          }
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    // Keepalive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      ws.close();
    };
  }, [isActive, wsUrl, wsToken]);

  const sendContentUpdate = useCallback(
    (content: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "content_update", content }),
        );
      }
    },
    [],
  );

  const handleNotesChange = (value: string) => {
    setNotes(value);
    // Debounce WS send
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sendContentUpdate(value);
    }, 300);
  };

  const handleStart = () => {
    const fd = new FormData();
    fd.set("sessionId", session.id);
    startTransition(() => { startAction(fd); });
  };

  const handleEnd = () => {
    // Save current notes first
    const fd = new FormData();
    fd.set("sessionId", session.id);
    fd.set("notes", notes);
    startTransition(async () => {
      await saveNotesAction(fd);
      const endFd = new FormData();
      endFd.set("sessionId", session.id);
      await endAction(endFd);
    });
  };

  const handleAddAction = () => {
    if (!newActionText.trim()) return;
    const fd = new FormData();
    fd.set("sessionId", session.id);
    fd.set("text", newActionText.trim());
    startTransition(() => {
      addActionItemAction(fd);
      setNewActionText("");
    });
  };

  const handleToggleAction = (item: OneOnOneActionItem) => {
    const fd = new FormData();
    fd.set("sessionId", session.id);
    fd.set("itemId", item.id);
    fd.set("completed", String(!item.completed));
    startTransition(() => { toggleActionItemAction(fd); });

    // Send via WS for real-time
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "action_toggle", itemId: item.id, completed: !item.completed }),
      );
    }
  };

  const handleDeleteAction = (itemId: string) => {
    const fd = new FormData();
    fd.set("sessionId", session.id);
    fd.set("itemId", itemId);
    startTransition(() => { deleteActionItemAction(fd); });
  };

  const handleAddAgenda = () => {
    if (!newAgendaText.trim()) return;
    const fd = new FormData();
    fd.set("sessionId", session.id);
    fd.set("text", newAgendaText.trim());
    startTransition(() => {
      addAgendaItemAction(fd);
      setNewAgendaText("");
    });
  };

  const handleToggleAgenda = (item: OneOnOneAgendaItem) => {
    const fd = new FormData();
    fd.set("sessionId", session.id);
    fd.set("itemId", item.id);
    fd.set("covered", String(!item.covered));
    startTransition(() => { toggleAgendaItemAction(fd); });

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "agenda_toggle", itemId: item.id, covered: !item.covered }),
      );
    }
  };

  const handleGenerateAgenda = () => {
    const fd = new FormData();
    fd.set("sessionId", session.id);
    startTransition(() => { generateAgendaAction(fd); });
  };

  return (
    <div className="space-y-6">
      {/* Session controls + presence */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold text-stone-800">
            1:1 with {employeeName}
          </h2>
          {isActive && (
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  employeeConnected ? "bg-positive animate-pulse" : "bg-stone-300"
                }`}
              />
              <span className="text-xs text-stone-400">
                {employeeConnected ? `${employeeName} is watching` : `${employeeName} offline`}
              </span>
            </div>
          )}
          {editRequest && (
            <span className="rounded-full bg-amber/10 px-2.5 py-0.5 text-[10px] font-semibold text-warning">
              Edit requested
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isScheduled && (
            <button
              onClick={handleStart}
              disabled={isPending}
              className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
            >
              Start Session
            </button>
          )}
          {isActive && (
            <button
              onClick={handleEnd}
              disabled={isPending}
              className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
            >
              End Session
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Notes editor — 2/3 width */}
        <div className="lg:col-span-2">
          <div
            className="rounded-2xl border border-stone-200/60 bg-white"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <div className="border-b border-stone-100 px-5 py-3">
              <h3 className="text-sm font-medium text-stone-700">Meeting Notes</h3>
            </div>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              disabled={isCompleted}
              placeholder={isScheduled ? "Start the session to begin taking notes..." : "Type your notes here..."}
              className="min-h-[400px] w-full resize-y border-0 bg-transparent px-5 py-4 text-sm text-stone-800 placeholder:text-stone-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              style={{ fontFamily: "var(--font-body, inherit)" }}
            />
          </div>
        </div>

        {/* Sidebar — agenda + action items */}
        <div className="space-y-4">
          {/* Agenda */}
          <div
            className="rounded-2xl border border-stone-200/60 bg-white"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <h3 className="text-sm font-medium text-stone-700">Agenda</h3>
              {!isCompleted && (
                <button
                  onClick={handleGenerateAgenda}
                  disabled={isPending}
                  className="text-[11px] font-medium text-forest hover:text-forest/80 disabled:opacity-50"
                >
                  Generate
                </button>
              )}
            </div>
            <div className="p-4">
              {session.agendaItems.length === 0 ? (
                <p className="text-xs text-stone-400 italic">
                  {isScheduled ? "Agenda will be generated when you start the session." : "No agenda items yet."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {session.agendaItems.map((item) => (
                    <li key={item.id} className="flex items-start gap-2">
                      <button
                        onClick={() => handleToggleAgenda(item)}
                        disabled={isCompleted}
                        className="mt-0.5 shrink-0"
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                            item.covered
                              ? "border-forest bg-forest text-white"
                              : "border-stone-300 text-transparent"
                          }`}
                        >
                          &#10003;
                        </span>
                      </button>
                      <span
                        className={`text-xs ${
                          item.covered ? "text-stone-400 line-through" : "text-stone-700"
                        }`}
                      >
                        {item.text}
                        {item.source === "ai" && (
                          <span className="ml-1 text-[10px] text-stone-300">AI</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!isCompleted && (
                <div className="mt-3 flex gap-1.5">
                  <input
                    value={newAgendaText}
                    onChange={(e) => setNewAgendaText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddAgenda()}
                    placeholder="Add topic..."
                    className="flex-1 rounded-md border border-stone-200 px-2.5 py-1.5 text-xs text-stone-700 placeholder:text-stone-300 focus:border-forest/50 focus:outline-none"
                  />
                  <button
                    onClick={handleAddAgenda}
                    disabled={!newAgendaText.trim()}
                    className="rounded-md bg-stone-100 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Action Items */}
          <div
            className="rounded-2xl border border-stone-200/60 bg-white"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <div className="border-b border-stone-100 px-4 py-3">
              <h3 className="text-sm font-medium text-stone-700">Action Items</h3>
            </div>
            <div className="p-4">
              {session.actionItems.length === 0 ? (
                <p className="text-xs text-stone-400 italic">No action items yet.</p>
              ) : (
                <ul className="space-y-2">
                  {session.actionItems.map((item) => (
                    <li key={item.id} className="flex items-start gap-2">
                      <button
                        onClick={() => handleToggleAction(item)}
                        disabled={isCompleted}
                        className="mt-0.5 shrink-0"
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                            item.completed
                              ? "border-forest bg-forest text-white"
                              : "border-stone-300 text-transparent"
                          }`}
                        >
                          &#10003;
                        </span>
                      </button>
                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-xs ${
                            item.completed ? "text-stone-400 line-through" : "text-stone-700"
                          }`}
                        >
                          {item.text}
                        </span>
                        {item.dueDate && (
                          <span className="ml-1 text-[10px] text-stone-400">
                            due {new Date(item.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                      {!isCompleted && (
                        <button
                          onClick={() => handleDeleteAction(item.id)}
                          className="shrink-0 text-xs text-stone-300 hover:text-danger"
                        >
                          &times;
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!isCompleted && (
                <div className="mt-3 flex gap-1.5">
                  <input
                    value={newActionText}
                    onChange={(e) => setNewActionText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddAction()}
                    placeholder="Add action item..."
                    className="flex-1 rounded-md border border-stone-200 px-2.5 py-1.5 text-xs text-stone-700 placeholder:text-stone-300 focus:border-forest/50 focus:outline-none"
                  />
                  <button
                    onClick={handleAddAction}
                    disabled={!newActionText.trim()}
                    className="rounded-md bg-stone-100 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
