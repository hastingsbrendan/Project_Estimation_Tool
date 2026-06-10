"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { formatCurrency } from "@/lib/calc"
import type { DraftResult, DraftSection } from "@/lib/ai/walkthrough-drafter"

/**
 * Walkthrough → draft estimate. The original product vision: walk the
 * jobsite, talk, get a reviewable draft.
 *
 *  1. 🎤 uses the Web Speech API (Chrome/Edge/Safari; free, on-device
 *     UI) to transcribe continuously into the textarea. Browsers
 *     without SpeechRecognition just type/paste — same flow.
 *  2. "Draft estimate" sends the transcript to a server action where
 *     Claude maps it against the user's real catalog.
 *  3. The draft renders with per-item checkboxes; nothing touches the
 *     project until "Add to estimate".
 */

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function VoiceCapture({
  draftAction,
  applyAction,
}: {
  draftAction: (transcript: string) => Promise<DraftResult>
  applyAction: (
    sections: DraftSection[],
  ) => Promise<{ ok: boolean; added: number; error?: string }>
}) {
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [interim, setInterim] = useState("")
  const [listening, setListening] = useState(false)
  const [micSupported, setMicSupported] = useState(false)
  const [drafting, startDraft] = useTransition()
  const [applying, startApply] = useTransition()
  const [error, setError] = useState("")
  const [draft, setDraft] = useState<{ sections: DraftSection[]; notes: string | null } | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [applied, setApplied] = useState<number | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    setMicSupported(getSpeechRecognition() != null)
  }, [])

  function startListening() {
    const Ctor = getSpeechRecognition()
    if (!Ctor) return
    setError("")
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = "en-US"
    rec.onresult = (event: any) => {
      let finalChunk = ""
      let interimChunk = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r.isFinal) finalChunk += r[0].transcript
        else interimChunk += r[0].transcript
      }
      if (finalChunk) {
        setTranscript((prev) => (prev ? prev + " " : "") + finalChunk.trim())
      }
      setInterim(interimChunk)
    }
    rec.onerror = (event: any) => {
      setError(
        event?.error === "not-allowed"
          ? "Microphone permission denied — type your notes instead."
          : `Mic error: ${event?.error ?? "unknown"} — type your notes instead.`,
      )
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      setInterim("")
    }
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  function stopListening() {
    recRef.current?.stop()
    setListening(false)
  }

  function itemKey(si: number, ii: number) {
    return `${si}:${ii}`
  }

  function runDraft() {
    setError("")
    setDraft(null)
    setApplied(null)
    startDraft(async () => {
      const r = await draftAction(transcript)
      if (!r.ok) {
        setError(r.error)
        return
      }
      if (r.sections.length === 0) {
        setError(r.notes ?? "Nothing actionable found in the notes — add more detail.")
        return
      }
      setDraft({ sections: r.sections, notes: r.notes })
      // Default everything checked.
      const all: Record<string, boolean> = {}
      r.sections.forEach((s, si) => s.items.forEach((_, ii) => (all[itemKey(si, ii)] = true)))
      setChecked(all)
    })
  }

  function runApply() {
    if (!draft) return
    const selected: DraftSection[] = draft.sections
      .map((s, si) => ({
        name: s.name,
        items: s.items.filter((_, ii) => checked[itemKey(si, ii)]),
      }))
      .filter((s) => s.items.length > 0)
    if (selected.length === 0) return
    startApply(async () => {
      const r = await applyAction(selected)
      if (!r.ok) {
        setError(r.error ?? "Apply failed")
        return
      }
      setApplied(r.added)
      setDraft(null)
      setTranscript("")
    })
  }

  const selectedCount = draft
    ? draft.sections.reduce(
        (n, s, si) => n + s.items.filter((_, ii) => checked[itemKey(si, ii)]).length,
        0,
      )
    : 0

  if (!open) {
    return (
      <div className="bg-accent-soft/40 border border-accent rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-foreground">
          🎤 <strong>Walk the job, talk it out.</strong>{" "}
          <span className="text-foreground-muted">
            Dictate (or paste) your walkthrough and get a draft estimate from
            your own catalog.
          </span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover shrink-0"
        >
          Start
        </button>
        {applied != null && (
          <p className="w-full text-xs text-success">✓ Added {applied} items to the estimate.</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-surface border border-accent rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">🎤 Walkthrough → draft estimate</p>
        <button
          type="button"
          onClick={() => {
            stopListening()
            setOpen(false)
          }}
          className="text-xs text-foreground-soft hover:text-foreground"
        >
          ✕ Close
        </button>
      </div>

      <textarea
        value={interim ? `${transcript} ${interim}` : transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={5}
        placeholder={
          micSupported
            ? "Tap the mic and talk — “Kitchen is twelve by ten, tear out the cabinets and the tile floor, new drywall on the sink wall…” — or type here."
            : "Type or paste your walkthrough notes — “Kitchen is twelve by ten, tear out the cabinets and the tile floor…”"
        }
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
      />

      <div className="flex items-center gap-2 flex-wrap">
        {micSupported && (
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              listening
                ? "bg-danger text-white animate-pulse"
                : "bg-surface border border-border text-foreground hover:bg-accent-soft"
            }`}
          >
            {listening ? "■ Stop listening" : "🎤 Dictate"}
          </button>
        )}
        <button
          type="button"
          disabled={drafting || !transcript.trim()}
          onClick={runDraft}
          className="px-3 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {drafting ? "Drafting…" : "✨ Draft estimate"}
        </button>
        {transcript && !drafting && (
          <button
            type="button"
            onClick={() => setTranscript("")}
            className="text-xs text-foreground-soft hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <p aria-live="polite" className="text-xs text-danger bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      {draft && (
        <div className="space-y-3 border-t border-border pt-3">
          {draft.notes && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              ⚠ {draft.notes}
            </p>
          )}
          {draft.sections.map((s, si) => (
            <div key={si}>
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-1">
                {s.name}
              </p>
              <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {s.items.map((it, ii) => {
                  const k = itemKey(si, ii)
                  return (
                    <li key={ii} className="flex items-center gap-2 px-3 py-2 text-sm bg-surface">
                      <input
                        type="checkbox"
                        checked={!!checked[k]}
                        onChange={(e) =>
                          setChecked((prev) => ({ ...prev, [k]: e.target.checked }))
                        }
                        className="accent-accent"
                      />
                      <span className="flex-1 min-w-0 truncate text-foreground">
                        {it.description}
                        {it.catalogItemId ? (
                          <span className="ml-1 text-[10px] text-success" title="Matched to your catalog">
                            ●
                          </span>
                        ) : (
                          <span className="ml-1 text-[10px] text-foreground-soft" title="Custom item — price it before sending">
                            ○
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-foreground-soft tabular-nums shrink-0">
                        {it.quantity} {it.unit} × {formatCurrency(it.unitPrice)}
                      </span>
                      <span className="text-[10px] uppercase text-foreground-soft w-4 text-center shrink-0">
                        {it.kind === "labor" ? "S" : "M"}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-foreground-soft">
              ● = from your catalog · ○ = custom, price before sending
            </p>
            <button
              type="button"
              disabled={applying || selectedCount === 0}
              onClick={runApply}
              className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
            >
              {applying ? "Adding…" : `Add ${selectedCount} item${selectedCount === 1 ? "" : "s"} to estimate`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
