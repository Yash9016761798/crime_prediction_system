import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  Bot,
  Minus,
  Paperclip,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/apiClient';

const Z_INDEX = 9999;

const NAVY = '#0b1f3b';
const NAVY_SOFT = '#12325e';
const BLUE = '#2563eb';
const BLUE_LIGHT = '#3b82f6';

const ERROR_TEXT =
  "Sorry, I couldn't retrieve that information right now. Please try again.";

const QUICK_PROMPTS = [
  "What's happening today?",
  'Active SOS Alerts',
  'Latest Crime News',
  'India Crime News',
  'Latest Cybercrime',
  'Global Crime News',
  'Current Crime Trends',
  'Crime Hotspots',
  'Dashboard Summary',
  'Historical Crime Data',
];

type ChatSource = {
  title?: string;
  url?: string;
  source?: string;
  label?: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: number;
  sources?: ChatSource[];
  scope?: string;
};

function greeting(): ChatMessage {
  return {
    id: 'greeting',
    role: 'assistant',
    text:
      "Hello! I'm your AI Crime Intelligence Assistant, ready to help with " +
      'crime statistics, security insights, active alerts and the latest news. ' +
      'Pick a prompt below or just ask me anything.',
    at: nowMs(),
  };
}

function timeLabel(at: number): string {
  try {
    return new Date(at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `m${messageSeq}`;
}

// Module level on purpose: react-hooks/purity treats Date.now as impure when it
// appears inside the component body, where it can be reached from render.
function nowMs(): number {
  return Date.now();
}

export default function CrimeIntelChatbot() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [greeting()]);
  const [atBottom, setAtBottom] = useState(true);
  const [aiStatus, setAiStatus] = useState<'unknown' | 'connected' | 'api_key_missing' | 'authentication_failed' | 'model_unavailable' | 'rate_limited' | 'provider_unavailable'>('unknown');

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasAsked = messages.some(m => m.role === 'user');

  useEffect(() => {
    if (open && !minimized) inputRef.current?.focus();
  }, [open, minimized]);

  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [messages, sending, atBottom]);

  function handleListScroll() {
    const el = listRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(remaining < 48);
  }

  function jumpToLatest() {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAtBottom(true);
  }

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || sending) return;

    setError(null);
    setInput('');
    setAtBottom(true);

    const outbound: ChatMessage[] = [
      ...messages,
      { id: nextId(), role: 'user', text, at: nowMs() },
    ];
    setMessages(outbound);
    setSending(true);

    try {
      const response = await apiFetch('/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversation: outbound.map(m => ({ role: m.role, text: m.text })),
        }),
      });

      if (!response.ok) {
        const status = response.status;
        // Classify the error based on HTTP status code
        let classifiedStatus: 'api_key_missing' | 'authentication_failed' | 'model_unavailable' | 'rate_limited' | 'provider_unavailable' = 'provider_unavailable';
        if (status === 503) classifiedStatus = 'api_key_missing';
        else if (status === 401 || status === 403) classifiedStatus = 'authentication_failed';
        else if (status === 429) classifiedStatus = 'rate_limited';
        else if (status >= 500) classifiedStatus = 'provider_unavailable';
        setAiStatus(classifiedStatus);
        throw new Error(`chat_${status}`);
      }

      const data = await response.json();
      const answer = typeof data?.answer === 'string' ? data.answer.trim() : '';
      if (!answer) {
        setAiStatus('provider_unavailable');
        throw new Error('chat_empty');
      }

      setMessages(prev => [...prev, { id: nextId(), role: 'assistant', text: answer, at: nowMs(), sources: Array.isArray(data.sources) ? data.sources : [], scope: typeof data.scope === 'string' ? data.scope : undefined }]);
      setAiStatus('connected');
    } catch {
      setAiStatus('provider_unavailable');
      setError(ERROR_TEXT);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  function clearConversation() {
    setMessages([greeting()]);
    setError(null);
    setInput('');
    setAtBottom(true);
    inputRef.current?.focus();
  }

  function toggleOpen() {
    setOpen(prev => {
      const next = !prev;
      if (next) setMinimized(false);
      return next;
    });
  }

  const showWindow = open && !minimized;
  const showLauncher = !open || minimized;

  return (
    <>
      <style>{`
        @keyframes ci-chat-in {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ci-dot {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }
        .ci-window { animation: ci-chat-in 200ms cubic-bezier(0.16, 1, 0.3, 1); }
        .ci-dot { animation: ci-dot 1.1s infinite; }
        .ci-list { scroll-behavior: smooth; }
        .ci-launcher:hover {
          transform: scale(1.08);
          box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.18),
            0 12px 30px rgba(11, 31, 59, 0.45);
        }
        @media (max-width: 640px) {
          .ci-window {
            width: calc(100vw - 16px) !important;
            height: calc(100vh - 80px) !important;
            right: 8px !important;
            bottom: 72px !important;
          }
        }
      `}</style>

      {showLauncher && (
        <button
          type="button"
          onClick={toggleOpen}
          aria-label="Open AI Crime Intelligence Assistant"
          className="ci-launcher"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            zIndex: Z_INDEX,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(135deg, ${NAVY} 0%, ${BLUE} 100%)`,
            color: '#ffffff',
            transition: 'transform 180ms ease, box-shadow 180ms ease',
            boxShadow: '0 10px 26px rgba(11, 31, 59, 0.42)',
          }}
        >
          <Bot size={26} aria-hidden="true" />
          {minimized && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#22c55e',
                border: '2px solid #ffffff',
              }}
            />
          )}
        </button>
      )}

      {showWindow && (
        <section
          role="dialog"
          aria-label="AI Crime Intelligence Assistant"
          className="ci-window"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 88,
            width: 400,
            height: 620,
            maxWidth: '100vw',
            maxHeight: 'calc(100vh - 96px)',
            zIndex: Z_INDEX,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: 16,
            background: '#ffffff',
            border: '1px solid rgba(15, 23, 42, 0.12)',
            boxShadow: '0 24px 64px rgba(11, 31, 59, 0.34)',
            fontFamily:
              "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
            color: '#0f172a',
          }}
        >
          <header
            style={{
              flex: '0 0 auto',
              padding: '14px 14px 14px 16px',
              background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_SOFT} 100%)`,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.28)',
                border: '1px solid rgba(147, 197, 253, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: '0 0 auto',
              }}
            >
              <Bot size={18} aria-hidden="true" />
            </span>

            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                AI Crime Intelligence Assistant
              </div>
              <div
                style={{
                  fontSize: 11,
                  lineHeight: 1.35,
                  color: 'rgba(226, 232, 240, 0.82)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Your AI-powered crime and security assistant
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 10,
                  letterSpacing: 0.3,
                  color: 'rgba(187, 240, 208, 0.95)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#4ade80',
                    display: 'inline-block',
                  }}
                />
                {aiStatus === 'connected'
                  ? 'Connected'
                  : aiStatus === 'api_key_missing'
                  ? 'API key missing'
                  : aiStatus === 'authentication_failed'
                  ? 'Authentication failed'
                  : aiStatus === 'model_unavailable'
                  ? 'Model unavailable'
                  : aiStatus === 'rate_limited'
                  ? 'Rate limited'
                  : 'Provider unavailable'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 4, flex: '0 0 auto' }}>
              <HeaderButton
                label="Clear conversation"
                onClick={clearConversation}
              >
                <Trash2 size={15} aria-hidden="true" />
              </HeaderButton>
              <HeaderButton
                label="Minimise assistant"
                onClick={() => setMinimized(true)}
              >
                <Minus size={15} aria-hidden="true" />
              </HeaderButton>
              <HeaderButton
                label="Close assistant"
                onClick={() => {
                  setOpen(false);
                  setMinimized(false);
                }}
              >
                <X size={15} aria-hidden="true" />
              </HeaderButton>
            </div>
          </header>

          <div
            ref={listRef}
            onScroll={handleListScroll}
            className="ci-list custom-scrollbar"
            style={{
              flex: '1 1 auto',
              overflowY: 'auto',
              padding: '16px 14px 8px',
              background: '#f8fafc',
              position: 'relative',
            }}
          >
            {messages.map(message => (
              <Message key={message.id} message={message} />
            ))}

            {!hasAsked && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 7,
                  marginTop: 6,
                  paddingLeft: 40,
                }}
              >
                {QUICK_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void send(prompt)}
                    disabled={sending}
                    style={{
                      border: '1px solid rgba(37, 99, 235, 0.34)',
                      background: '#ffffff',
                      color: BLUE,
                      borderRadius: 999,
                      padding: '6px 11px',
                      fontSize: 11.5,
                      lineHeight: 1.3,
                      cursor: sending ? 'not-allowed' : 'pointer',
                      opacity: sending ? 0.6 : 1,
                      transition:
                        'background 150ms ease, border-color 150ms ease',
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {sending && (
              <div
                style={{
                  display: 'flex',
                  gap: 7,
                  alignItems: 'center',
                  marginTop: 12,
                }}
                aria-live="polite"
              >
                <Avatar />
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid rgba(15, 23, 42, 0.1)',
                    borderRadius: 14,
                    padding: '11px 14px',
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                  }}
                >
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="ci-dot"
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: BLUE_LIGHT,
                        display: 'inline-block',
                        animationDelay: `${i * 0.16}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                style={{
                  marginTop: 12,
                  marginLeft: 40,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                {error}
              </div>
            )}
          </div>

          {!atBottom && (
            <button
              type="button"
              onClick={jumpToLatest}
              aria-label="Scroll to latest messages"
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                bottom: 78,
                zIndex: Z_INDEX + 1,
                border: '1px solid rgba(15, 23, 42, 0.14)',
                background: '#ffffff',
                color: NAVY,
                borderRadius: 999,
                padding: '5px 10px',
                fontSize: 11,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                boxShadow: '0 6px 16px rgba(11, 31, 59, 0.18)',
              }}
            >
              <ArrowDown size={13} aria-hidden="true" />
              Latest
            </button>
          )}

          <form
            onSubmit={handleSubmit}
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              padding: '10px 12px',
              borderTop: '1px solid rgba(15, 23, 42, 0.1)',
              background: '#ffffff',
            }}
          >
            <button
              type="button"
              disabled
              title="File attachments are not enabled"
              aria-label="Attach a file (not enabled)"
              style={{
                flex: '0 0 auto',
                width: 34,
                height: 34,
                borderRadius: 10,
                border: '1px solid rgba(15, 23, 42, 0.14)',
                background: '#f1f5f9',
                color: '#64748b',
                cursor: 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.7,
              }}
            >
              <Paperclip size={15} aria-hidden="true" />
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask about crime, statistics, news, or security..."
              aria-label="Message"
              style={{
                flex: '1 1 auto',
                resize: 'none',
                minHeight: 34,
                maxHeight: 110,
                padding: '8px 11px',
                borderRadius: 10,
                border: '1px solid rgba(15, 23, 42, 0.16)',
                background: '#f8fafc',
                color: '#0f172a',
                fontSize: 13,
                lineHeight: 1.45,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />

            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              style={{
                flex: '0 0 auto',
                width: 34,
                height: 34,
                borderRadius: 10,
                border: 'none',
                background:
                  sending || !input.trim()
                    ? '#cbd5e1'
                    : `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_LIGHT} 100%)`,
                color: '#ffffff',
                cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Send size={15} aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        border: '1px solid rgba(147, 197, 253, 0.28)',
        background: 'rgba(255, 255, 255, 0.08)',
        color: '#ffffff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

function Avatar() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        flex: '0 0 auto',
        background: `linear-gradient(135deg, ${NAVY} 0%, ${BLUE} 100%)`,
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Bot size={14} />
    </span>
  );
}

function SourceList({ sources }: { sources: ChatSource[] }) {
  const usable = sources.filter(s => s && (s.title || s.url));
  if (!usable.length) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
      {usable.map((source, index) => {
        const isWeb = source.source === 'web';
        const label =
          source.label || (isWeb ? 'Current Web Information' : 'Project Data');
        const text = source.title || source.url || '';
        const external = Boolean(
          source.url && /^https?:\/\//i.test(source.url)
        );

        return external ? (
          <a
            key={`${source.url}-${index}`}
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            title={`${label}: ${source.url}`}
            style={{
              fontSize: 10.5,
              lineHeight: 1.35,
              padding: '4px 8px',
              borderRadius: 999,
              textDecoration: 'none',
              color: isWeb ? '#0f766e' : '#1d4ed8',
              background: isWeb ? '#ecfeff' : '#eff6ff',
              border: `1px solid ${isWeb ? '#a5f3fc' : '#bfdbfe'}`,
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {text}
          </a>
        ) : (
          <span
            key={`${text}-${index}`}
            title={label}
            style={{
              fontSize: 10.5,
              lineHeight: 1.35,
              padding: '4px 8px',
              borderRadius: 999,
              color: '#334155',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            maxWidth: '78%',
            background: BLUE,
            color: '#ffffff',
            borderRadius: '16px 16px 4px 16px',
            padding: '9px 13px',
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <div>{message.text}</div>
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              opacity: 0.75,
              textAlign: 'right',
            }}
          >
            {timeLabel(message.at)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <Avatar />
      <div style={{ minWidth: 0, maxWidth: '78%' }}>
        <div
          style={{
            background: '#ffffff',
            border: '1px solid rgba(15, 23, 42, 0.1)',
            borderRadius: '16px 16px 16px 4px',
            padding: '9px 13px',
            fontSize: 13,
            lineHeight: 1.55,
            color: '#0f172a',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
          }}
        >
          <div>{message.text}</div>
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color: '#94a3b8',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>{timeLabel(message.at)}</span>
            {message.scope && message.scope !== 'general' && (
              <span style={{ color: BLUE, fontWeight: 600 }}>
                {message.scope === 'live'
                  ? 'Current Web Information'
                  : message.scope === 'project'
                    ? 'Project Data'
                    : 'Project Data + Web'}
              </span>
            )}
          </div>
          {message.sources && <SourceList sources={message.sources} />}
        </div>
      </div>
    </div>
  );
}
