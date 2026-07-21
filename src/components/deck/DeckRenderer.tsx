'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DeckMeta, DeckSlide } from '@/lib/deck/types'
import './deck.css'

/**
 * The in-app session deck presenter. A faithful port of the standalone
 * teaching deck's markup and navigation (build_deck.py's slide
 * functions and nav script, read from the Session 1 HTML output): every
 * slide mounted, one active, arrow keys and click zones to move, F for
 * full screen, Home/End to jump, the brass progress bar on top, the
 * seven-dot watermark and footer on every slide. Data in, deck out;
 * the component holds no session-specific copy.
 */

interface DeckRendererProps {
  slides: DeckSlide[]
  meta: DeckMeta
}

function SlideBody({ slide }: { slide: DeckSlide }) {
  switch (slide.slide_type) {
    case 'cover':
      return (
        <>
          <div className="dk-eyebrow">{slide.eyebrow}</div>
          <h1 className="dk-display">{slide.title}</h1>
          <p className="dk-lede">
            <em>{slide.subtitle}</em>
          </p>
          <div className="dk-meta">
            {slide.meta_left} <span className="dk-times">×</span> {slide.meta_right}
            <span className="dk-dot">·</span>
            {slide.meta_when}
          </div>
        </>
      )
    case 'section':
      return (
        <>
          <div className="dk-section-num">{slide.num}</div>
          <h2 className="dk-section-title">{slide.title}</h2>
          {slide.sub ? <p className="dk-section-sub">{slide.sub}</p> : null}
        </>
      )
    case 'idea':
      return (
        <>
          <div className="dk-eyebrow">{slide.eyebrow}</div>
          <h2 className="dk-idea-head">{slide.head}</h2>
          <p className="dk-idea-sup">{slide.sup}</p>
        </>
      )
    case 'agenda':
      return (
        <>
          <div className="dk-eyebrow">{slide.eyebrow}</div>
          <h2 className="dk-list-title">{slide.title}</h2>
          <ol className="dk-agenda">
            {slide.items.map((item, i) => (
              <li key={i}>
                <span className="dk-ai">{String(i + 1).padStart(2, '0')}</span>
                <span className="dk-at">{item}</span>
              </li>
            ))}
          </ol>
          {slide.footnote ? <div className="dk-agenda-foot">{slide.footnote}</div> : null}
        </>
      )
    case 'tracks':
      return (
        <>
          <div className="dk-eyebrow">{slide.eyebrow}</div>
          <h2 className="dk-list-title">{slide.title}</h2>
          {slide.tracks.map((track) => (
            <div className="dk-track" key={track.label}>
              <div className={track.alt ? 'dk-track-label dk-alt' : 'dk-track-label'}>
                {track.label}
              </div>
              <div className="dk-track-flow">
                {track.chips.map((chip) => (
                  <span className="dk-chip" key={chip}>
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {slide.note ? <p className="dk-track-note">{slide.note}</p> : null}
        </>
      )
    case 'loop':
      return (
        <>
          <div className="dk-eyebrow">{slide.eyebrow}</div>
          <h2 className="dk-list-title">{slide.title}</h2>
          <div className="dk-loop-flow">
            {slide.steps.map((step, i) => (
              <span key={step} style={{ display: 'contents' }}>
                {i > 0 ? <span className="dk-loop-arrow">→</span> : null}
                <span className="dk-loop-step">{step}</span>
              </span>
            ))}
          </div>
          {slide.note ? <p className="dk-track-note">{slide.note}</p> : null}
        </>
      )
    case 'homework':
      return (
        <>
          <div className="dk-eyebrow">{slide.eyebrow}</div>
          <h2 className="dk-list-title">{slide.title}</h2>
          <ul className="dk-homework">
            {slide.rows.map((row, i) => (
              <li key={i}>
                <span className="dk-hw-who">{row.who}</span>
                <span className="dk-hw-task">{row.task}</span>
              </li>
            ))}
          </ul>
        </>
      )
    case 'close':
      return (
        <>
          <h2 className="dk-close-quote">
            {slide.line1}
            <br />
            <span className="dk-q2">{slide.line2}</span>
          </h2>
          <div className="dk-close-attr">{slide.attr}</div>
        </>
      )
  }
}

const SLIDE_CLASS: Record<DeckSlide['slide_type'], string> = {
  cover: 'dk-slide',
  section: 'dk-slide dk-section',
  idea: 'dk-slide dk-idea',
  agenda: 'dk-slide',
  tracks: 'dk-slide',
  loop: 'dk-slide',
  homework: 'dk-slide',
  close: 'dk-slide dk-close',
}

export default function DeckRenderer({ slides, meta }: DeckRendererProps) {
  const [cur, setCur] = useState(0)
  const total = slides.length

  const show = useCallback(
    (n: number) => setCur(Math.max(0, Math.min(total - 1, n))),
    [total]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) {
        e.preventDefault()
        setCur((c) => Math.min(total - 1, c + 1))
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault()
        setCur((c) => Math.max(0, c - 1))
      } else if (e.key === 'Home') {
        show(0)
      } else if (e.key === 'End') {
        show(total - 1)
      } else if (e.key.toLowerCase() === 'f') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen()
        else document.exitFullscreen()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [show, total])

  const onClick = (e: React.MouseEvent) => {
    if (e.clientX < window.innerWidth * 0.28) setCur((c) => Math.max(0, c - 1))
    else setCur((c) => Math.min(total - 1, c + 1))
  }

  return (
    <div className="dk-stage">
      <div className="dk-bar" style={{ width: `${((cur + 1) / total) * 100}%` }} />
      <div className="dk-deck" onClick={onClick}>
        {slides.map((slide, i) => (
          <section
            key={i}
            className={i === cur ? `${SLIDE_CLASS[slide.slide_type]} dk-active` : SLIDE_CLASS[slide.slide_type]}
          >
            <SlideBody slide={slide} />
            <div className="dk-dots" aria-hidden>
              {Array.from({ length: 7 }, (_, d) => (
                <i key={d} />
              ))}
            </div>
            <div className="dk-foot">
              <span className="dk-fc">{meta.footerLeft}</span>
              <span>{meta.program}</span>
              <span>
                Session {meta.sessionNumber} · {String(i + 1).padStart(2, '0')} /{' '}
                {String(total).padStart(2, '0')}
              </span>
            </div>
          </section>
        ))}
      </div>
      <div className="dk-hint">Arrow keys to move · F for full screen</div>
    </div>
  )
}
