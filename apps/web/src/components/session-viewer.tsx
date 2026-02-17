"use client";

import { useState, useEffect, useRef } from "react";
import type { OneOnOneSessionDetail } from "@/lib/api";

interface SessionViewerProps {
  session: OneOnOneSessionDetail;
  currentUserId: string;
  managerName: string;
  wsUrl: string | null;
}

export function SessionViewer({
  session,
  currentUserId,
  managerName,
  wsUrl,
}: SessionViewerProps) {
  const [notes, setNotes] = useState(session.notes);
  const [managerConnected, setManagerConnected] = useState(false);
  const [agendaState, setAgendaState] = useState(
    new Map(session.agendaItems.map((a) => [a.id, a.covered])),
  );
  const [actionState, setActionState] = useState(
    new Map(session.actionItems.map((a) => [a.id, a.completed])),
  );
  const wsRef = useRef<WebSocket | null>(null);

  const isActive = session.status === "active";
  const isCompleted = session.status === "completed";

  // WebSocket connection for active sessions
  useEffect(() => {
    if (!isActive || !wsUrl) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "content_sync":
          setNotes(msg.content);
          break;
        case "presence":
          setManagerConnected(msg.managerConnected);
          break;
        case "agenda_updated":
          setAgendaState((prev) => new Map(prev).set(msg.itemId, msg.covered));
          break;
        case "action_updated":
          setActionState((prev) => new Map(prev).set(msg.itemId, msg.completed));
          break;
        case "session_ended":
          // Reload page on session end
          window.location.reload();
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      ws.close();
    };
  }, [isActive, wsUrl]);

  const handleRequestEdit = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "request_edit" }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + presence */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold text-stone-800">
            1:1 with {managerName}
          </h2>
          {isActive && (
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  managerConnected ? "bg-positive animate-pulse" : "bg-stone-300"
                }`}
              />
              <span className="text-xs text-stone-400">
                {managerConnected ? `${managerName} is typing` : `${managerName} offline`}
              </span>
            </div>
          )}
        </div>

        {isActive && (
          <button
            onClick={handleRequestEdit}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50"
          >
            Request Edit
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Notes display — 2/3 width */}
        <div className="lg:col-span-2">
          <div
            className="rounded-2xl border border-stone-200/60 bg-white"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <div className="border-b border-stone-100 px-5 py-3">
              <h3 className="text-sm font-medium text-stone-700">Meeting Notes</h3>
            </div>
            <div className="min-h-[400px] px-5 py-4">
              {notes ? (
                <pre className="whitespace-pre-wrap text-sm text-stone-800" style={{ fontFamily: "var(--font-body, inherit)" }}>
                  {notes}
                </pre>
              ) : (
                <p className="text-sm text-stone-300 italic">
                  {isActive
                    ? "Waiting for manager to start typing..."
                    : "No notes yet."}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — read-only agenda + actions */}
        <div className="space-y-4">
          {/* Agenda */}
          <div
            className="rounded-2xl border border-stone-200/60 bg-white"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <div className="border-b border-stone-100 px-4 py-3">
              <h3 className="text-sm font-medium text-stone-700">Agenda</h3>
            </div>
            <div className="p-4">
              {session.agendaItems.length === 0 ? (
                <p className="text-xs text-stone-400 italic">No agenda items.</p>
              ) : (
                <ul className="space-y-2">
                  {session.agendaItems.map((item) => {
                    const covered = agendaState.get(item.id) ?? item.covered;
                    return (
                      <li key={item.id} className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                            covered
                              ? "border-forest bg-forest text-white"
                              : "border-stone-300 text-transparent"
                          }`}
                        >
                          &#10003;
                        </span>
                        <span
                          className={`text-xs ${
                            covered ? "text-stone-400 line-through" : "text-stone-700"
                          }`}
                        >
                          {item.text}
                          {item.source === "ai" && (
                            <span className="ml-1 text-[10px] text-stone-300">AI</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
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
                <p className="text-xs text-stone-400 italic">No action items.</p>
              ) : (
                <ul className="space-y-2">
                  {session.actionItems.map((item) => {
                    const completed = actionState.get(item.id) ?? item.completed;
                    return (
                      <li key={item.id} className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                            completed
                              ? "border-forest bg-forest text-white"
                              : "border-stone-300 text-transparent"
                          }`}
                        >
                          &#10003;
                        </span>
                        <div className="flex-1 min-w-0">
                          <span
                            className={`text-xs ${
                              completed ? "text-stone-400 line-through" : "text-stone-700"
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
