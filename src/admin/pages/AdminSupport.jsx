import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAdminSupportThreads,
  fetchAdminSupportThread,
  sendAdminSupportReply,
  updateAdminSupportThreadStatus,
} from "../services/admin.api";
import "./AdminSupport.css";

const POLL_INTERVAL_ACTIVE_MS = 5000;
const POLL_INTERVAL_HIDDEN_MS = 20000;
const FOCUS_REFRESH_DEBOUNCE_MS = 1200;

function fmtDate(v) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return String(v);
  }
}

function snippet(v, max = 140) {
  const s = String(v || "").trim();
  if (!s) return "Sem prévia.";
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function statusLabel(status) {
  const map = {
    open: "Aberto",
    pending: "Pendente",
    answered: "Respondido",
    closed: "Fechado",
  };
  return map[String(status || "")] || String(status || "-");
}

function threadsSignature(items) {
  return JSON.stringify(
    (Array.isArray(items) ? items : []).map((thread) => ({
      id: thread?.id || "",
      status: thread?.status || "",
      subject: thread?.subject || "",
      customer_email: thread?.customer_email || "",
      customer_name: thread?.customer_name || "",
      last_message_at: thread?.last_message_at || "",
      last_message_preview: thread?.last_message_preview || "",
      unread_count: thread?.unread_count || 0,
    }))
  );
}

function detailSignature(res) {
  if (!res?.thread) return "";

  return JSON.stringify({
    thread: {
      id: res.thread?.id || "",
      status: res.thread?.status || "",
      subject: res.thread?.subject || "",
      customer_name: res.thread?.customer_name || "",
      customer_email: res.thread?.customer_email || "",
      last_message_at: res.thread?.last_message_at || "",
    },
    messages: Array.isArray(res?.messages)
      ? res.messages.map((msg) => ({
          id: msg?.id || "",
          direction: msg?.direction || "",
          from_email: msg?.from_email || "",
          subject: msg?.subject || "",
          text_body: msg?.text_body || "",
          created_at: msg?.created_at || "",
          sent_at: msg?.sent_at || "",
          attachments_meta: Array.isArray(msg?.attachments_meta)
            ? msg.attachments_meta.map((att) => att?.filename || att?.name || "")
            : [],
        }))
      : [],
    templates: Array.isArray(res?.templates)
      ? res.templates.map((tpl) => ({
          key: tpl?.key || "",
          name: tpl?.name || "",
          title: tpl?.title || "",
          subtitle: tpl?.subtitle || "",
          intro_text: tpl?.intro_text || "",
        }))
      : [],
  });
}

export default function AdminSupport() {
  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [subject, setSubject] = useState("");
  const [messageText, setMessageText] = useState("");

  const aliveRef = useRef(true);
  const pollingRef = useRef(false);
  const loadDetailRef = useRef(false);
  const lastFocusRefreshRef = useRef(0);

  const threadIdRef = useRef("");
  const threadsRef = useRef([]);
  const detailRef = useRef(null);
  const statusFilterRef = useRef("all");
  const searchRef = useRef("");
  const sendingRef = useRef(false);

  const draftStoreRef = useRef({});

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  const saveDraftForThread = useCallback((id, nextDraft) => {
    if (!id) return;
    draftStoreRef.current[id] = {
      templateKey: nextDraft.templateKey ?? "",
      subject: nextDraft.subject ?? "",
      messageText: nextDraft.messageText ?? "",
    };
  }, []);

  const applyDraftForThread = useCallback((id, res) => {
    const saved = draftStoreRef.current[id];
    const firstTemplate = res?.templates?.[0]?.key || "";
    const threadSubject = String(res?.thread?.subject || "");

    if (saved) {
      const safeTemplate =
        saved.templateKey && res?.templates?.some((x) => x.key === saved.templateKey)
          ? saved.templateKey
          : firstTemplate;

      setTemplateKey(safeTemplate);
      setSubject(saved.subject ?? threadSubject);
      setMessageText(saved.messageText ?? "");
      return;
    }

    setTemplateKey(firstTemplate);
    setSubject(threadSubject);
    setMessageText("");
  }, []);

  const loadThreads = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
        setError("");
      }

      try {
        const res = await fetchAdminSupportThreads({
          status: statusFilterRef.current,
          q: searchRef.current,
        });

        const items = Array.isArray(res?.items) ? res.items : [];

        if (!aliveRef.current) return items;

        const prevSig = threadsSignature(threadsRef.current);
        const nextSig = threadsSignature(items);

        if (prevSig !== nextSig) {
          setThreads(items);
        }

        const currentThreadId = threadIdRef.current;

        if (!currentThreadId && items[0]?.id) {
          setThreadId(items[0].id);
        } else if (currentThreadId && !items.some((x) => x.id === currentThreadId)) {
          setThreadId(items[0]?.id || "");
        }

        return items;
      } catch (e) {
        if (!silent && aliveRef.current) {
          setError(String(e?.message || e));
        }
        throw e;
      } finally {
        if (!silent && aliveRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  const loadDetail = useCallback(
    async (id, { silent = false, preserveComposer = false } = {}) => {
      if (!id) {
        if (aliveRef.current) {
          setDetail(null);
        }
        return null;
      }

      if (loadDetailRef.current) return detailRef.current;

      loadDetailRef.current = true;

      if (!silent) {
        setLoadingDetail(true);
        setError("");
      }

      try {
        const res = await fetchAdminSupportThread({ thread_id: id });

        if (!aliveRef.current) return res;

        const prevSig = detailSignature(detailRef.current);
        const nextSig = detailSignature(res);

        if (prevSig !== nextSig) {
          setDetail(res || null);
        }

        if (!preserveComposer) {
          applyDraftForThread(id, res);
        } else {
          setTemplateKey((curr) => {
            if (curr && res?.templates?.some((x) => x.key === curr)) return curr;
            return res?.templates?.[0]?.key || "";
          });

          setSubject((curr) => {
            if (String(curr || "").trim()) return curr;
            return String(res?.thread?.subject || "");
          });
        }

        return res;
      } catch (e) {
        if (!silent && aliveRef.current) {
          setError(String(e?.message || e));
        }
        throw e;
      } finally {
        loadDetailRef.current = false;
        if (!silent && aliveRef.current) {
          setLoadingDetail(false);
        }
      }
    },
    [applyDraftForThread]
  );

  const refreshCurrentThreadSilently = useCallback(async () => {
    const currentId = threadIdRef.current;
    if (!currentId) return;

    await loadDetail(currentId, { silent: true, preserveComposer: true });
  }, [loadDetail]);

  const runSilentRefresh = useCallback(async () => {
    if (pollingRef.current || sendingRef.current) return;

    pollingRef.current = true;

    try {
      const items = await loadThreads({ silent: true });
      const currentId = threadIdRef.current;

      if (currentId && Array.isArray(items) && items.some((x) => x.id === currentId)) {
        await loadDetail(currentId, { silent: true, preserveComposer: true });
      }
    } catch {
      // polling silencioso: não exibe erro recorrente na UI
    } finally {
      pollingRef.current = false;
    }
  }, [loadThreads, loadDetail]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    loadDetail(threadId, { preserveComposer: false });
  }, [threadId, loadDetail]);

  useEffect(() => {
    loadThreads();
  }, [statusFilter, loadThreads]);

  useEffect(() => {
    const intervalMs =
      document.visibilityState === "visible" ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_HIDDEN_MS;

    const interval = setInterval(() => {
      runSilentRefresh();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [runSilentRefresh, statusFilter, search, threadId]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        runSilentRefresh();
      }
    }

    function handleWindowFocus() {
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < FOCUS_REFRESH_DEBOUNCE_MS) return;
      lastFocusRefreshRef.current = now;
      runSilentRefresh();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [runSilentRefresh]);

  useEffect(() => {
    saveDraftForThread(threadId, { templateKey, subject, messageText });
  }, [threadId, templateKey, subject, messageText, saveDraftForThread]);

  const selectedTemplate = useMemo(() => {
    return detail?.templates?.find((x) => x.key === templateKey) || null;
  }, [detail, templateKey]);

  async function onSend(e) {
    e.preventDefault();
    if (!threadId || !templateKey || !messageText.trim()) return;

    setSending(true);
    setError("");

    try {
      await sendAdminSupportReply({
        thread_id: threadId,
        template_key: templateKey,
        subject,
        message_text: messageText,
      });

      draftStoreRef.current[threadId] = {
        templateKey,
        subject,
        messageText: "",
      };

      setMessageText("");

      await loadDetail(threadId, { preserveComposer: true });
      await loadThreads({ silent: true });
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(next) {
    if (!threadId) return;

    try {
      await updateAdminSupportThreadStatus({ thread_id: threadId, status: next });
      await refreshCurrentThreadSilently();
      await loadThreads({ silent: true });
    } catch (e) {
      setError(String(e?.message || e));
    }
  }

  function handleManualRefresh() {
    loadThreads();
    if (threadIdRef.current) {
      loadDetail(threadIdRef.current, { preserveComposer: true });
    }
  }

  function handleSearch() {
    loadThreads();
  }

  return (
    <div className="support-page">
      <div className="support-page-header">
        <div>
          <h1>Suporte</h1>
          <p>Inbox premium da Dominion Black para leitura, resposta e acompanhamento das conversas de suporte.</p>
        </div>
      </div>

      {error ? <div className="support-banner-error">{error}</div> : null}

      <div className="support-layout">
        <aside className="support-sidebar-panel">
          <div className="support-sidebar-toolbar">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              <option value="open">Abertos</option>
              <option value="pending">Pendentes</option>
              <option value="answered">Respondidos</option>
              <option value="closed">Fechados</option>
            </select>

            <button type="button" onClick={handleManualRefresh} disabled={loading || loadingDetail}>
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>

          <div className="support-search-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por email, nome ou assunto"
            />
            <button type="button" onClick={handleSearch} disabled={loading}>
              Buscar
            </button>
          </div>

          <div className="support-thread-list">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`support-thread-item ${threadId === thread.id ? "active" : ""}`}
                onClick={() => setThreadId(thread.id)}
              >
                <div className="support-thread-top">
                  <span className="support-thread-email">{thread.customer_email}</span>
                  <span className={`support-status support-status-${thread.status}`}>
                    {statusLabel(thread.status)}
                  </span>
                </div>

                <div className="support-thread-subject">{thread.subject}</div>
                <div className="support-thread-preview">{snippet(thread.last_message_preview)}</div>
                <div className="support-thread-date">{fmtDate(thread.last_message_at)}</div>
              </button>
            ))}

            {!threads.length && !loading ? (
              <div className="support-empty">Nenhuma conversa encontrada.</div>
            ) : null}
          </div>
        </aside>

        <section className="support-main-panel">
          {!detail?.thread ? (
            <div className="support-empty-main">
              Selecione uma conversa para visualizar e responder.
            </div>
          ) : (
            <>
              <div className="support-thread-header">
                <div>
                  <h2>{detail.thread.subject}</h2>
                  <p>
                    {detail.thread.customer_name || "Cliente"} • {detail.thread.customer_email} • Última
                    atualização {fmtDate(detail.thread.last_message_at)}
                  </p>
                </div>

                <div className="support-thread-actions">
                  <button type="button" onClick={() => changeStatus("open")}>
                    Abrir
                  </button>
                  <button type="button" onClick={() => changeStatus("pending")}>
                    Pendente
                  </button>
                  <button type="button" onClick={() => changeStatus("closed")}>
                    Fechar
                  </button>
                </div>
              </div>

              <div className="support-messages">
                {(detail.messages || []).map((msg) => (
                  <article
                    key={msg.id}
                    className={`support-message-card ${msg.direction === "outbound" ? "outbound" : "inbound"}`}
                  >
                    <div className="support-message-meta">
                      <strong>{msg.direction === "outbound" ? "Dominion Black" : msg.from_email}</strong>
                      <span>{fmtDate(msg.created_at || msg.sent_at)}</span>
                    </div>

                    <div className="support-message-subject">{msg.subject}</div>
                    <div className="support-message-body">{msg.text_body || "(sem texto legível)"}</div>

                    {Array.isArray(msg.attachments_meta) && msg.attachments_meta.length > 0 ? (
                      <div className="support-attachments">
                        {msg.attachments_meta.map((att, idx) => (
                          <span key={idx} className="support-attachment-chip">
                            {att?.filename || att?.name || "anexo"}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>

              <form className="support-reply-box" onSubmit={onSend}>
                <div className="support-reply-grid">
                  <label>
                    Template
                    <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
                      {(detail.templates || []).map((tpl) => (
                        <option key={tpl.key} value={tpl.key}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Assunto
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Re: assunto original"
                    />
                  </label>
                </div>

                {selectedTemplate ? (
                  <div className="support-template-preview">
                    <div className="support-template-title">{selectedTemplate.title}</div>
                    <div className="support-template-subtitle">{selectedTemplate.subtitle}</div>
                    <div className="support-template-intro">{selectedTemplate.intro_text}</div>
                  </div>
                ) : null}

                <label className="support-textarea-wrap">
                  Mensagem
                  <textarea
                    rows={10}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Escreva aqui a resposta que será encaixada automaticamente no shell premium da Dominion Black."
                  />
                </label>

                <div className="support-reply-footer">
                  <span>O envio sai via Resend com template HTML real e fica salvo no histórico da thread.</span>
                  <button type="submit" disabled={sending || loadingDetail}>
                    {sending ? "Enviando..." : "Enviar resposta"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}