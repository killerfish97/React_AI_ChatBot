import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getGeminiGenerateUrl } from './constants'
import { MarkdownAnswer } from './MarkdownAnswer'

function toGeminiContents(thread) {
  return thread
    .filter(
      (m) =>
        m.role === 'user' ||
        (m.role === 'assistant' && m.content && !m.pending),
    )
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }))
}

function truncate(str, max = 52) {
  const t = str.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/** @param {{ id: string; role: string; content?: string; pending?: boolean }[]} messages */
function getTurns(messages) {
  const turns = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role !== 'user') continue
    const assistant = messages[i + 1]?.role === 'assistant' ? messages[i + 1] : null
    turns.push({ user: m, assistant })
    if (assistant) i += 1
  }
  return turns
}

function MenuIcon() {
  return (
    <svg
      width={20}
      height={14}
      viewBox='0 0 20 14'
      fill='none'
      className='shrink-0'
      aria-hidden
    >
      <path
        d='M0 1h20M0 7h20M0 13h20'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
      />
    </svg>
  )
}

function ChatTypingIndicator() {
  return (
    <div className='flex items-center gap-1.5 py-1' aria-label='Loading response'>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className='h-2 w-2 rounded-full bg-zinc-400'
          style={{
            animation: 'chat-bounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  )
}

function App() {
  const initialId = useMemo(() => crypto.randomUUID(), [])
  const [sessions, setSessions] = useState(() => [
    { id: initialId, title: 'New chat', messages: [] },
  ])
  const [activeSessionId, setActiveSessionId] = useState(initialId)
  const [question, setQuestion] = useState('')
  const [apiError, setApiError] = useState(null)
  const [isSending, setIsSending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const scrollRef = useRef(null)

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const messages = activeSession?.messages ?? []

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, activeSessionId])

  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [sidebarOpen])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => {
      if (mq.matches) setSidebarOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const scrollToMessage = (messageId) => {
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
    setSidebarOpen(false)
  }

  const handleNewChat = () => {
    if (isSending) return
    const id = crypto.randomUUID()
    setSessions((prev) => [{ id, title: 'New chat', messages: [] }, ...prev])
    setActiveSessionId(id)
    setQuestion('')
    setApiError(null)
    setSidebarOpen(false)
  }

  const handleSelectSession = (id) => {
    if (isSending || id === activeSessionId) return
    setActiveSessionId(id)
    setApiError(null)
    setSidebarOpen(false)
  }

  const askQuestion = async () => {
    const text = question.trim()
    if (!text || isSending) return

    const sessionId = activeSessionId
    setApiError(null)
    setQuestion('')

    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    const userMsg = { id: userId, role: 'user', content: text }
    const assistantPlaceholder = {
      id: assistantId,
      role: 'assistant',
      content: '',
      pending: true,
    }

    const prev =
      sessions.find((s) => s.id === sessionId)?.messages ?? []

    setSessions((list) =>
      list.map((s) => {
        if (s.id !== sessionId) return s
        const isFirst = s.messages.length === 0
        return {
          ...s,
          messages: [...s.messages, userMsg, assistantPlaceholder],
          title: isFirst ? truncate(text, 44) : s.title,
        }
      }),
    )
    setIsSending(true)

    let url
    try {
      url = getGeminiGenerateUrl()
    } catch (e) {
      setApiError(e.message)
      setSessions((list) =>
        list.map((s) =>
          s.id === sessionId ? { ...s, messages: s.messages.slice(0, -2) } : s,
        ),
      )
      setIsSending(false)
      return
    }

    const contents = toGeminiContents([...prev, userMsg])
    const payload = { contents }

    const finishAssistant = (content, isError = false) => {
      setSessions((list) =>
        list.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, content, pending: false, isError }
                    : m,
                ),
              }
            : s,
        ),
      )
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const responseData = await response.json()

      if (!response.ok) {
        const msg = responseData?.error?.message ?? response.statusText
        let friendly = msg || `Request failed (${response.status})`
        if (response.status === 429) {
          const retry = msg.match(/retry in ([\d.]+)s/i)
          const sec = retry ? Math.ceil(parseFloat(retry[1], 10)) : null
          friendly =
            sec != null
              ? `Rate limit / quota exceeded. Try again in about ${sec}s, or check quota in Google AI Studio.`
              : `Rate limit / quota exceeded: ${msg}`
        }
        finishAssistant(friendly, true)
        console.error(responseData)
        return
      }

      const replyText =
        responseData?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!replyText) {
        finishAssistant(
          'No text in response (empty candidates or blocked content).',
          true,
        )
        return
      }

      finishAssistant(replyText, false)
    } catch (e) {
      finishAssistant(e.message ?? 'Network error', true)
      console.error(e)
    } finally {
      setIsSending(false)
    }
  }

  const turns = getTurns(messages)

  return (
    <div className='flex min-h-dvh h-dvh flex-col bg-zinc-950 text-zinc-100 lg:flex-row'>
      {sidebarOpen ? (
        <button
          type='button'
          className='fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px] lg:hidden'
          aria-label='Close menu'
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* Left: sessions + this chat history (drawer on small screens) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(20rem,calc(100vw-2.5rem))] max-w-[85vw] flex-col border-r border-zinc-800 bg-zinc-900 transition-transform duration-200 ease-out motion-reduce:transition-none lg:static lg:z-0 lg:h-auto lg:max-w-none lg:w-72 lg:shrink-0 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className='flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:pt-3'>
          <button
            type='button'
            onClick={handleNewChat}
            disabled={isSending}
            className='min-h-11 min-w-0 flex-1 rounded-xl border border-zinc-600 bg-zinc-800 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'
          >
            New chat
          </button>
          <button
            type='button'
            className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-600 text-zinc-200 hover:bg-zinc-800 lg:hidden'
            aria-label='Close sidebar'
            onClick={() => setSidebarOpen(false)}
          >
            <span className='text-lg leading-none' aria-hidden>
              ×
            </span>
          </button>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain'>
          <p className='px-3 pt-3 text-xs font-medium uppercase tracking-wide text-zinc-500'>
            Chats
          </p>
          <ul className='p-2'>
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type='button'
                  disabled={isSending}
                  onClick={() => handleSelectSession(s.id)}
                  className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
                    s.id === activeSessionId
                      ? 'bg-zinc-800 text-white ring-1 ring-zinc-600'
                      : 'text-zinc-300 hover:bg-zinc-800/80'
                  }`}
                >
                  <span className='line-clamp-2'>{s.title}</span>
                </button>
              </li>
            ))}
          </ul>

          {turns.length > 0 ? (
            <>
              <p className='px-3 pt-2 text-xs font-medium uppercase tracking-wide text-zinc-500'>
                This chat
              </p>
              <ul className='border-t border-zinc-800/80 p-2'>
                {turns.map((turn, idx) => (
                  <li key={turn.user.id}>
                    <button
                      type='button'
                      onClick={() => scrollToMessage(turn.user.id)}
                      className='mb-2 w-full rounded-lg border border-zinc-800 bg-zinc-950/50 px-2.5 py-2 text-left text-xs text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-950'
                    >
                      <span className='font-medium text-zinc-500'>
                        Q{idx + 1}
                      </span>
                      <p className='mt-0.5 line-clamp-2 text-zinc-200'>
                        {turn.user.content}
                      </p>
                      {turn.assistant ? (
                        <p className='mt-1 line-clamp-2 border-t border-zinc-800 pt-1 text-zinc-500'>
                          {turn.assistant.pending
                            ? '…'
                            : turn.assistant.isError
                              ? `Error: ${truncate(turn.assistant.content, 80)}`
                              : truncate(turn.assistant.content, 80)}
                        </p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </aside>

      <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
        <header className='flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-950/95 px-2 py-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur lg:hidden'>
          <button
            type='button'
            className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700 text-zinc-100 hover:bg-zinc-900 active:bg-zinc-800'
            aria-label='Open menu'
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon />
          </button>
          <h1 className='min-w-0 flex-1 truncate text-center text-sm font-medium text-zinc-200'>
            {activeSession?.title ?? 'Chat'}
          </h1>
          <span className='w-11 shrink-0' aria-hidden />
        </header>

        <div
          ref={scrollRef}
          className='min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 sm:px-4 sm:py-6 md:px-8'
        >
          <div className='mx-auto flex max-w-3xl flex-col gap-4 sm:gap-6'>
            {messages.length === 0 ? (
              <div className='rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 px-4 py-10 text-center text-sm text-zinc-500 sm:px-6 sm:py-12 sm:text-base'>
                Ask anything to start the conversation. Replies appear here
                with formatting.
              </div>
            ) : null}

            {messages.map((m) => (
              <div
                key={m.id}
                id={`msg-${m.id}`}
                className={
                  m.role === 'user'
                    ? 'flex justify-end scroll-mt-28 sm:scroll-mt-24'
                    : 'flex justify-start scroll-mt-28 sm:scroll-mt-24'
                }
              >
                <div
                  className={
                    m.role === 'user'
                      ? 'w-[min(100%,42rem)] max-w-[calc(100%-0.25rem)] rounded-2xl rounded-br-md bg-zinc-700 px-3 py-2.5 text-left text-sm text-zinc-100 shadow-sm sm:px-4 sm:py-3 sm:text-base'
                      : 'w-[min(100%,48rem)] max-w-[calc(100%-0.25rem)] rounded-2xl rounded-bl-md border border-zinc-700 bg-zinc-900/80 px-3 py-2.5 text-left text-sm shadow-sm sm:px-4 sm:py-3 sm:text-base'
                  }
                >
                  {m.role === 'user' ? (
                    <p className='whitespace-pre-wrap break-words leading-relaxed'>
                      {m.content}
                    </p>
                  ) : m.pending ? (
                    <ChatTypingIndicator />
                  ) : m.isError ? (
                    <p className='text-sm text-amber-400' role='alert'>
                      {m.content}
                    </p>
                  ) : (
                    <MarkdownAnswer markdown={m.content} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className='shrink-0 border-t border-zinc-800 bg-zinc-950/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-4 md:px-8 md:pb-4 md:pt-4'>
          <div className='mx-auto max-w-3xl'>
            <div className='flex items-end gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 p-2 shadow-lg'>
              <textarea
                rows={1}
                placeholder='Message…'
                className='max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-zinc-100 outline-none placeholder:text-zinc-500 sm:px-3'
                value={question}
                disabled={isSending}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    askQuestion()
                  }
                }}
              />
              <button
                type='button'
                onClick={askQuestion}
                disabled={isSending || !question.trim()}
                className='mb-0.5 flex min-h-11 min-w-[4.25rem] shrink-0 items-center justify-center rounded-xl bg-white px-3 text-sm font-medium text-zinc-900 transition enabled:hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 sm:mb-1 sm:px-4'
              >
                {isSending ? '…' : 'Send'}
              </button>
            </div>
            {apiError ? (
              <p className='mt-2 text-sm text-amber-400' role='alert'>
                {apiError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
