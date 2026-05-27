// ============================================================================
// LandingPage — the marketing front door for Aftertale.
//
// Game-agnostic positioning. Today the only capture mechanism is the WoW Lua
// addon, but the page never names a specific game.
//
// Routing: simplest possible. main.tsx renders <LandingPage /> at "/" (or any
// path without #app); rendered <App /> when the URL hash is "#app". The
// "Get started" CTAs flip the hash and let main.tsx re-render.
//
// All copy is placeholder until the marketing-copy and sample-chapter agents
// return their drafts. Sections are wired and styled so we can hot-swap copy
// in place without touching layout.
// ============================================================================

// Tier cards reused from the in-app pitch so this page and the Scribe's Desk
// pitch never drift out of sync.
import { TIERS, TierCard } from './ScribesDesk';
import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../lib/assetUrl';

// ----------------------------------------------------------------------------
// Reveal — wraps children in a div that animates in when scrolled into view.
// Single IntersectionObserver per <Reveal />, triggers once. Honors
// prefers-reduced-motion (just renders children with no animation).
// ----------------------------------------------------------------------------

type RevealVariant = 'up' | 'in' | 'left' | 'right' | 'scale';

function Reveal({
  children,
  variant = 'up',
  delay = 0,
  className = '',
  style,
  threshold = 0.15,
}: {
  children: React.ReactNode;
  variant?: RevealVariant;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={`at-reveal at-reveal-${variant} ${visible ? 'at-reveal-in' : ''} ${className}`.trim()}
      style={{ ...(style ?? {}), transitionDelay: delay ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  );
}


const NAV_LINKS = [
  { label: 'Get started', href: '#onboard' },
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

function gotoApp() {
  window.location.hash = '#app';
}

export function LandingPage() {
  return (
    <div className="aftertale-landing">
      <style>{landingStyles}</style>

      {/* ---------- Header ---------- */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <header className="at-header">
        <div className="at-container at-header-inner">
          <a href="/" className="at-logo" aria-label="Aftertale">
            <img src={assetUrl('aftertale-logo.png')} alt="Aftertale" className="at-logo-img" />
          </a>
          <nav className="at-nav">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </nav>
          <div className="at-header-cta">
            <a href="#app" className="at-btn at-btn-ghost" onClick={(e) => { e.preventDefault(); gotoApp(); }}>
              Sign in
            </a>
            <a href="#app" className="at-btn at-btn-primary" onClick={(e) => { e.preventDefault(); gotoApp(); }}>
              Get started
            </a>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="at-hero">
        <div className="at-container at-hero-inner">
          <p className="at-kicker at-hero-anim" style={{ animationDelay: '60ms' }}>✦ Your game, remembered</p>
          <h1 className="at-hero-headline at-hero-anim" style={{ animationDelay: '160ms' }}>
            Every hero deserves an Aftertale.
          </h1>
          <p className="at-hero-sub at-hero-anim" style={{ animationDelay: '320ms' }}>
            Aftertale turns your gameplay into a personalized AI-narrated novel
            where you are the protagonist. Every quest, victory, strange detour,
            and stubborn little errand becomes part of your hero's living
            chronicle.
          </p>
          <div className="at-hero-cta-row at-hero-anim" style={{ animationDelay: '480ms' }}>
            <a href="#app" className="at-btn at-btn-primary at-btn-lg" onClick={(e) => { e.preventDefault(); gotoApp(); }}>
              Start free
            </a>
            <a href="#pricing" className="at-btn at-btn-secondary at-btn-lg">
              See plans
            </a>
          </div>
          <p className="at-trust at-hero-anim" style={{ animationDelay: '620ms' }}>
            Free forever · Bring your own key · One hero to begin the tale
          </p>
        </div>
      </section>

      {/* ---------- Meet the hero (exhibit + sample chapter) ---------- */}
      <section className="at-section at-section-sample" id="sample">
        <div className="at-container">
          <Reveal variant="up">
            <p className="at-kicker at-kicker-center">✦ Meet a hero</p>
            <h2 className="at-section-h2 at-section-h2-center">This is Magnus Brunn.<br />This is his Aftertale.</h2>
            <p className="at-section-sub-center">
              Scroll through five pages: who he is, how he speaks, what shaped him, and the
              chapter Aftertale wrote from one quiet hour of play.
            </p>
          </Reveal>
          <Reveal variant="scale" delay={150}>
            <HeroExhibit />
          </Reveal>
        </div>
      </section>

      {/* ---------- Magic moment ---------- */}
      <section className="at-section at-section-magic" id="magic">
        <div className="at-container at-magic-inner">
          <Reveal variant="up">
            <div className="at-magic-copy">
              <p className="at-kicker">✦ After logout, story</p>
              <h2 className="at-section-h2">The chapter arrives when the world goes quiet.</h2>
              <p className="at-body">
                You log out, stretch, and wander to the kitchen. Then your phone
                buzzes with the part the game never wrote: the meaning of what
                you just lived through, shaped into prose, with your hero at the
                center of it.
              </p>
            </div>
          </Reveal>
          <Reveal variant="right" delay={150}>
            <PhoneMockup />
          </Reveal>
        </div>
      </section>

      {/* ---------- Onboarding (first-time activation) ---------- */}
      <section className="at-section at-section-onboard" id="onboard">
        <div className="at-container">
          <Reveal variant="up">
            <p className="at-kicker at-kicker-center">✦ Getting started</p>
            <h2 className="at-section-h2 at-section-h2-center">From signup to first chapter</h2>
          </Reveal>
          <div className="at-onboard-grid">
            <Reveal variant="up" delay={0}>
              <OnboardStep
                n={1}
                title="Start free"
                body="Create your account in under a minute. No credit card required. One hero is enough to begin the tale."
              />
            </Reveal>
            <Reveal variant="up" delay={80}>
              <OnboardStep
                n={2}
                title="Shape your hero"
                body="Tell Aftertale who they are, where they came from, and what they carry. Or let AI draft a starting hero bible you can refine."
              />
            </Reveal>
            <Reveal variant="up" delay={160}>
              <OnboardStep
                n={3}
                title="Connect your game"
                body="Install the capture addon. It watches for story moments while you play. It never controls your character or changes the game."
              />
            </Reveal>
            <Reveal variant="up" delay={240}>
              <OnboardStep
                n={4}
                title="Play normally"
                body="Quest, wander, get distracted, chase something shiny. Aftertale captures the shape of the session in the background."
              />
            </Reveal>
            <Reveal variant="up" delay={320}>
              <OnboardStep
                n={5}
                title="Read the chapter"
                body="When the session ends, your first Aftertale is waiting: a personalized chapter written from the hero you brought to life."
              />
            </Reveal>
          </div>
          <Reveal variant="up" delay={400}>
            <p className="at-onboard-reassure">
              Most players can reach their first chapter in one normal play session.
            </p>
          </Reveal>
          <Reveal variant="up" delay={480}>
            <div className="at-supported">
              <p className="at-supported-eyebrow">
                <span className="at-supported-pulse" aria-hidden /> Live today for World of Warcraft
              </p>
              <div className="at-supported-strip" role="list">
                <div className="at-supported-pill at-supported-pill-retail" role="listitem">
                  <span className="at-supported-pill-badge" aria-hidden>✦</span>
                  <span className="at-supported-pill-label">Retail</span>
                </div>
                <div className="at-supported-pill at-supported-pill-classic" role="listitem">
                  <span className="at-supported-pill-badge" aria-hidden>✦</span>
                  <span className="at-supported-pill-label">Classic</span>
                </div>
                <div className="at-supported-pill at-supported-pill-hardcore" role="listitem">
                  <span className="at-supported-pill-badge" aria-hidden>✦</span>
                  <span className="at-supported-pill-label">Hardcore</span>
                </div>
                <div className="at-supported-pill at-supported-pill-sod" role="listitem">
                  <span className="at-supported-pill-badge" aria-hidden>✦</span>
                  <span className="at-supported-pill-label">Season of Discovery</span>
                </div>
                <div className="at-supported-pill at-supported-pill-cata" role="listitem">
                  <span className="at-supported-pill-badge" aria-hidden>✦</span>
                  <span className="at-supported-pill-label">Cataclysm</span>
                </div>
                <div className="at-supported-pill at-supported-pill-mists" role="listitem">
                  <span className="at-supported-pill-badge" aria-hidden>✦</span>
                  <span className="at-supported-pill-label">Mists</span>
                </div>
              </div>
              <p className="at-supported-future">More games as each capture path is built right.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- How it works (steady-state loop) ---------- */}
      <section className="at-section" id="how">
        <div className="at-container">
          <Reveal variant="up">
            <h2 className="at-section-h2 at-section-h2-center">How it works after that</h2>
          </Reveal>
          <div className="at-how-grid">
            <Reveal variant="up" delay={0}><HowStep n={1} title="Play" body="Your session creates the raw material: quests, places, victories, detours, and quiet little moments." /></Reveal>
            <Reveal variant="up" delay={120}><HowStep n={2} title="Aftertale writes" body="Your hero bible gives those events memory, voice, and meaning." /></Reveal>
            <Reveal variant="up" delay={240}><HowStep n={3} title="Read" body="Each session becomes another chapter in a living chronicle." /></Reveal>
          </div>
        </div>
      </section>

      {/* ---------- Features grid ---------- */}
      <section className="at-section" id="features">
        <div className="at-container">
          <Reveal variant="up">
            <h2 className="at-section-h2 at-section-h2-center">What you get</h2>
          </Reveal>
          <div className="at-features-grid">
            <Reveal variant="up" delay={0}><FeatureTile title="Automatic session capture" body="Let Aftertale gather the important beats of play without turning your evening into homework." /></Reveal>
            <Reveal variant="up" delay={80}><FeatureTile title="Your AI storyteller" body="Each session becomes narrative prose that treats your hero like a protagonist, not a spreadsheet row." /></Reveal>
            <Reveal variant="up" delay={160}><FeatureTile title="Living cloud chronicle" body="Your chapters gather in one private library, building a long-form record of your adventures over time." /></Reveal>
            <Reveal variant="up" delay={240}><FeatureTile title="Chapter-ready alerts" body="Paid plans can send a push when a new chapter is ready, right when the magic lands." /></Reveal>
            <Reveal variant="up" delay={320}><FeatureTile title="Many heroes remembered" body="Track more than one character — alt, main, experiment, or recurring disaster — with the right plan." /></Reveal>
            <Reveal variant="up" delay={400}><FeatureTile title="Export finished sagas" body="Chronicler and Loremaster can export polished chapters as ePub or PDF artifacts worth keeping." /></Reveal>
          </div>
        </div>
      </section>

      {/* ---------- Tier pitch ---------- */}
      <section className="at-section" id="pricing">
        <div className="at-container">
          <Reveal variant="up">
            <h2 className="at-section-h2 at-section-h2-center">Choose your path</h2>
            <p className="at-section-sub-center">
              Free is the artisan path. The paid tiers let the story find you instead.
            </p>
          </Reveal>
          <div className="at-pricing-placeholder">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '1rem',
              }}
            >
              {TIERS.map((tier, i) => (
                <Reveal key={tier.id} variant="up" delay={i * 100}>
                  <TierCard
                    tier={tier}
                    onUpgrade={() => {
                      window.dispatchEvent(new CustomEvent('at:upgrade-clicked', { detail: tier.id }));
                      if (tier.id === 'free') gotoApp();
                    }}
                  />
                </Reveal>
              ))}
            </div>
            <Reveal variant="in" delay={300}>
              <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: 13, color: 'var(--at-text-soft)' }}>
                Cancel anytime. Your chronicle stays yours, and Free is always there when you want the artisan path.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="at-section" id="faq">
        <div className="at-container at-faq-container">
          <Reveal variant="up">
            <h2 className="at-section-h2 at-section-h2-center">Questions</h2>
          </Reveal>
          <Reveal variant="up" delay={100}>
            <Faq />
          </Reveal>
        </div>
      </section>

      {/* ---------- CTA footer band ---------- */}
      <section className="at-cta-band">
        <div className="at-container at-cta-band-inner">
          <Reveal variant="up">
            <h2>Your next chapter is one logout away.</h2>
            <a href="#app" className="at-btn at-btn-primary at-btn-lg" onClick={(e) => { e.preventDefault(); gotoApp(); }}>
              Get started — free
            </a>
          </Reveal>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="at-footer">
        <div className="at-container at-footer-inner">
          <div className="at-footer-brand">
            <p className="at-logo"><img src={assetUrl('aftertale-logo.png')} alt="Aftertale" className="at-logo-img at-logo-img-footer" /></p>
            <p className="at-footer-tag">
              Aftertale turns your gameplay into a personalized chronicle where your hero finally
              gets the story they earned.
            </p>
          </div>
          <div className="at-footer-cols">
            <FooterCol heading="Product" links={['How it works', 'Features', 'Pricing', 'Free tier', 'Companion', 'Loremaster']} />
            <FooterCol heading="Resources" links={['Getting started', 'Supported games', 'Privacy guide', 'BYOK setup', 'Export help', 'Contact support']} />
            <FooterCol heading="Company" links={['About Aftertale', 'Roadmap', 'Changelog', 'Community', 'Press', 'Careers']} />
          </div>
        </div>
        <div className="at-container at-footer-legal">
          <span>© 2026 Aftertale. All rights reserved.</span>
          <span><a href="#">Privacy</a> · <a href="#">Terms</a> · <a href="#">Cookies</a></span>
        </div>
        <div className="at-container at-footer-trademark">
          <p>
            World of Warcraft is a trademark of Blizzard Entertainment, Inc. Aftertale is
            not affiliated with, endorsed, sponsored, or specifically approved by
            Blizzard Entertainment.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Section components
// ----------------------------------------------------------------------------

function PhoneMockup() {
  return (
    <div className="at-phone">
      <div className="at-phone-frame">
        <div className="at-phone-notch" />
        <div className="at-phone-screen">
          <div className="at-phone-notification">
            <p className="at-phone-app">Aftertale</p>
            <p className="at-phone-title">New chapter ready</p>
            <p className="at-phone-body">"The Lantern Road Home" — your story continues.</p>
            <p className="at-phone-time">now</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HowStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="at-how-step">
      <div className="at-how-number">{n}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function OnboardStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="at-onboard-step">
      <div className="at-onboard-number">{n}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function FeatureTile({ title, body }: { title: string; body: string }) {
  return (
    <div className="at-feature">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// HeroExhibit — 5-page horizontal scroll-snap "meet Magnus" experience.
// Pages: Identity → Quote → Voice → Backstory → Chapter.
// Native scroll-snap on touch + prev/next buttons + dot nav for desktop.
// ----------------------------------------------------------------------------

const EXHIBIT_PAGES = ['hero', 'truth', 'voice', 'backstory', 'chapter'] as const;

function HeroExhibit() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    function onScroll() {
      if (!track) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = track.clientWidth;
        if (w === 0) return;
        const idx = Math.round(track.scrollLeft / w);
        setActive(Math.min(EXHIBIT_PAGES.length - 1, Math.max(0, idx)));
      });
    }
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') go(active - 1);
      if (e.key === 'ArrowRight') go(active + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function go(idx: number) {
    const track = trackRef.current;
    if (!track) return;
    const target = Math.min(EXHIBIT_PAGES.length - 1, Math.max(0, idx));
    track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' });
  }

  return (
    <div className="at-exhibit">
      <button
        className="at-exhibit-nav at-exhibit-nav-prev"
        onClick={() => go(active - 1)}
        disabled={active === 0}
        aria-label="Previous page"
      >
        ‹
      </button>
      <button
        className="at-exhibit-nav at-exhibit-nav-next"
        onClick={() => go(active + 1)}
        disabled={active === EXHIBIT_PAGES.length - 1}
        aria-label="Next page"
      >
        ›
      </button>

      <div className="at-exhibit-track" ref={trackRef}>
        <ExhibitPage type="hero" />
        <ExhibitPage type="truth" />
        <ExhibitPage type="voice" />
        <ExhibitPage type="backstory" />
        <ExhibitPage type="chapter" />
      </div>

      <div className="at-exhibit-dots">
        {EXHIBIT_PAGES.map((id, i) => (
          <button
            key={id}
            className={`at-exhibit-dot ${i === active ? 'at-exhibit-dot-active' : ''}`}
            onClick={() => go(i)}
            aria-label={`Go to ${id}`}
            aria-current={i === active ? 'true' : undefined}
          />
        ))}
      </div>

      <p className="at-exhibit-hint">
        {active + 1} / {EXHIBIT_PAGES.length} · <em>{EXHIBIT_PAGES[active]}</em> · use ← →, swipe, or click the dots
      </p>
    </div>
  );
}

function ExhibitPage({ type }: { type: typeof EXHIBIT_PAGES[number] }) {
  return (
    <div className={`at-exhibit-page at-exhibit-page-${type}`}>
      {type === 'hero' && <IdentityPanel />}
      {type === 'truth' && <QuotePanel />}
      {type === 'voice' && <VoicePanel />}
      {type === 'backstory' && <BackstoryPanel />}
      {type === 'chapter' && <ChapterPanel />}
    </div>
  );
}


function CornerFlourish({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  const rotation = { tl: 0, tr: 90, br: 180, bl: 270 }[corner];
  return (
    <svg
      className={`at-corner at-corner-${corner}`}
      viewBox="0 0 60 60"
      width="48"
      height="48"
      aria-hidden
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <path
        d="M 4 4 L 28 4 M 4 4 L 4 28 M 4 4 Q 18 6 22 12 Q 26 18 22 22 Q 18 26 12 22 Q 6 18 4 4"
        fill="none"
        stroke="#c79bf0"
        strokeWidth="1.2"
        opacity="0.55"
        strokeLinecap="round"
      />
      <circle cx="22" cy="22" r="2" fill="#c79bf0" opacity="0.6" />
    </svg>
  );
}

function PanelFrame({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'quote' | 'forge' }) {
  return (
    <div className={`at-panel-frame at-panel-frame-${variant}`}>
      <CornerFlourish corner="tl" />
      <CornerFlourish corner="tr" />
      <CornerFlourish corner="bl" />
      <CornerFlourish corner="br" />
      {variant === 'forge' && <div className="at-ember-glow" aria-hidden />}
      {variant === 'quote' && (
        <>
          <div className="at-ember-glow at-ember-glow-bottom" aria-hidden />
          <FloatingEmbers />
        </>
      )}
      <div className="at-panel-content">{children}</div>
    </div>
  );
}

function FloatingEmbers() {
  // 12 ember motes that drift upward, randomized via CSS animation delays.
  return (
    <div className="at-embers" aria-hidden>
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className="at-ember"
          style={{
            left: `${(i * 7 + (i % 3) * 13) % 100}%`,
            animationDelay: `${(i * 0.7) % 6}s`,
            animationDuration: `${6 + (i % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}

function IdentityPanel() {
  return (
    <PanelFrame variant="forge">
      <div className="at-identity-layout">
        {/* Left: hero portrait card (AI-rendered Magnus art with embedded frame + stamps) */}
        <div className="at-identity-card at-identity-card-portrait">
          <img
            src={assetUrl('magnus-card.jpg')}
            alt="Magnus Brunn — Hero, Saga in progress. Forgesworn, Iron-bound, Mid-saga."
            className="at-identity-portrait"
            loading="lazy"
          />
        </div>

        {/* Right: name + stats */}
        <div className="at-identity-meta">
          <p className="at-panel-kicker">Meet the hero</p>
          <h3 className="at-identity-name">Magnus<br />Brunn</h3>
          <p className="at-identity-rolecall">Dwarf · Paladin of the Forgelight</p>

          <div className="at-identity-stats-stacked">
            <div className="at-stat-row">
              <span className="at-stat-label">From</span>
              <span className="at-stat-value">The deep mountain kingdoms, where iron remembers every hand that shaped it.</span>
            </div>
            <div className="at-stat-row">
              <span className="at-stat-label">Carries</span>
              <span className="at-stat-value">His brother Calder's hammer, worn smooth at the grip and heavy with old silence.</span>
            </div>
            <div className="at-stat-row">
              <span className="at-stat-label">Vow</span>
              <span className="at-stat-value">Hold the line. Name the cowards. Leave no road unmended.</span>
            </div>
            <div className="at-stat-row">
              <span className="at-stat-label">Chapter</span>
              <span className="at-stat-value">Thirty-five · The Road from Mirewatch</span>
            </div>
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}

function QuotePanel() {
  return (
    <PanelFrame variant="quote">
      <div className="at-quote-layout">
        <p className="at-panel-kicker at-panel-kicker-center">The hero's truth</p>
        <div className="at-quote-flourish at-quote-flourish-top" aria-hidden>
          <svg viewBox="0 0 240 20" width="180" height="14">
            <path d="M 0 10 L 100 10 M 120 4 Q 122 10 120 16 M 140 10 L 240 10" stroke="#c79bf0" strokeWidth="1" fill="none" opacity="0.7" />
            <circle cx="120" cy="10" r="3" fill="#c79bf0" opacity="0.8" />
          </svg>
        </div>
        <blockquote className="at-quote-text">
          <span className="at-drop-quote">&ldquo;</span>The forge does not lie.<span className="at-drop-quote at-drop-quote-close">&rdquo;</span>
        </blockquote>
        <p className="at-quote-attrib">— Magnus Brunn</p>
        <div className="at-quote-flourish at-quote-flourish-bottom" aria-hidden>
          <svg viewBox="0 0 240 20" width="180" height="14">
            <path d="M 0 10 L 100 10 M 120 4 Q 122 10 120 16 M 140 10 L 240 10" stroke="#c79bf0" strokeWidth="1" fill="none" opacity="0.7" />
            <circle cx="120" cy="10" r="3" fill="#c79bf0" opacity="0.8" />
          </svg>
        </div>
        <p className="at-quote-context">
          Every hero in Aftertale carries a truth at their center. Not a slogan. Not a
          stat block. Something the story can return to when the road gets dark.
        </p>
        <div className="at-quote-gloss">
          <p className="at-quote-context at-quote-context-gloss">
            For Magnus, it is this: fire reveals what metal is. Pressure reveals what men
            are. The forge does not flatter, excuse, or forgive.
          </p>
          <p className="at-quote-context at-quote-context-coda">It only shows what holds.</p>
        </div>
      </div>
    </PanelFrame>
  );
}

function VoicePanel() {
  return (
    <PanelFrame>
      <div className="at-voice-layout">
        <div className="at-voice-intro">
          <p className="at-panel-kicker">The voice</p>
          <h3 className="at-voice-headline">
            <span>Weathered.</span>
            <span>Plainspoken.</span>
            <span>Dry when warranted.</span>
          </h3>
          <p className="at-voice-body">
            Magnus does not waste words. He speaks like a man who has learned that silence
            can carry weight, and that most promises sound better before anyone has to keep
            them.
          </p>
        </div>
        <div className="at-voice-transcript">
          <p className="at-voice-stamp">— Transcribed at the village hall, after sundown —</p>
          <div className="at-voice-exchange">
            <div className="at-voice-line at-voice-line-other">
              <span className="at-voice-speaker">Reeve</span>
              <p>"You took the camp alone?"</p>
            </div>
            <div className="at-voice-line at-voice-line-hero">
              <span className="at-voice-speaker">Magnus</span>
              <p>"Aye."</p>
            </div>
            <div className="at-voice-line at-voice-line-other">
              <span className="at-voice-speaker">Reeve</span>
              <p>"Were you afraid?"</p>
            </div>
            <div className="at-voice-line at-voice-line-hero">
              <span className="at-voice-speaker">Magnus</span>
              <p>"Course I was."</p>
            </div>
            <div className="at-voice-line at-voice-line-other">
              <span className="at-voice-speaker">Reeve</span>
              <p>"But you went anyway?"</p>
            </div>
            <div className="at-voice-line at-voice-line-hero">
              <span className="at-voice-speaker">Magnus</span>
              <p>"That's the part people keep giving prettier names."</p>
            </div>
          </div>
          <p className="at-voice-footnote">
            Aftertale carries this voice forward. NPCs respond to it. Narration bends
            around it. Each chapter sounds less like a generic fantasy summary and more
            like the person who lived it.
          </p>
        </div>
      </div>
    </PanelFrame>
  );
}

function BackstoryPanel() {
  return (
    <PanelFrame>
      <div className="at-backstory-layout">
        <div className="at-backstory-header">
          <p className="at-panel-kicker">The backstory</p>
          <h3 className="at-backstory-headline">Before the road, before the hammer.</h3>
          <p className="at-backstory-sub">
            Four memories from Magnus's hero bible. Aftertale folds them into future
            chapters so the past keeps returning where it matters.
          </p>
        </div>
        <div className="at-backstory-timeline">
          <div className="at-timeline-spine" aria-hidden />
          <BackstoryBeat
            roman="I"
            year="The Early Years"
            title="Born Beneath the Mountain"
            body="Magnus was raised where the dark was honest and the only light came from forgefire. He knew the smell of hot iron before he knew his letters, and learned early that useful things were often made by being struck."
          />
          <BackstoryBeat
            roman="II"
            year="A Cold Year"
            title="The Lower Shaft Fell In"
            body="His brother Calder went below with seven other miners and did not come back. For three days, the mountain answered every pick and prayer with silence. After that, laughter in the Brunn house became a thing people remembered carefully."
          />
          <BackstoryBeat
            roman="III"
            year="The Calling"
            title="The Forgelight Answered"
            body="Magnus took up Calder's hammer first because no one else could bear to touch it. The calling came later, not as a song or vision, but as heat in the bones and a simple command: hold."
          />
          <BackstoryBeat
            roman="IV"
            year="Today"
            title="Skeptical of Clean Boots"
            body="He has little patience for nobles, commanders, or men who speak of sacrifice from dry rooms. Still, when the road breaks, Magnus mends it. When the weak are cornered, he stands in the gap."
          />
        </div>
      </div>
    </PanelFrame>
  );
}

function BackstoryBeat({ roman, year, title, body }: { roman: string; year: string; title: string; body: string }) {
  return (
    <div className="at-timeline-beat">
      <div className="at-timeline-marker">
        <span className="at-timeline-roman">{roman}</span>
      </div>
      <div className="at-timeline-content">
        <p className="at-timeline-year">{year}</p>
        <h4>{title}</h4>
        <p>{body}</p>
      </div>
    </div>
  );
}

function ChapterPanel() {
  return (
    <PanelFrame>
      <div className="at-chapter-layout">
        <header className="at-chapter-head">
          <p className="at-panel-kicker at-kicker-center">Tonight's Aftertale</p>
          <h3 className="at-chapter-title">The Hammer Remembers</h3>
          <div className="at-chapter-rule" aria-hidden>
            <span /><span className="at-chapter-rule-dot">✦</span><span />
          </div>
          <p className="at-chapter-meta">Generated from one logged session · 540 words</p>
        </header>
        <div className="at-chapter-prose">
          <p>
            <span className="at-dropcap">B</span>y sundown, the road to Mirewatch had turned the
            color of old tea. Rainwater sat in the cart ruts. Smoke from supper fires drifted low
            across the fields, carrying the smell of wet straw, onions, and horse sweat.
          </p>
          <p>
            Magnus Brunn came back with mud to his knees and blood drying black along the rim of
            his shield.
          </p>
          <p>
            The farmers watched from their doorways. No one cheered. That suited him. Cheering was
            what people did before they understood the bill.
          </p>
          <p>
            The Brand had made camp in the alder hollow north of the mill, where the ground went
            soft underfoot and the trees held the day's rain in their leaves. There had been nine
            of them. Maybe ten. Men were hard to count once they started running.
          </p>
          <p>They had laughed when they saw him.</p>
          <p>
            One dwarf. One dented shield. One old hammer with a cracked leather grip. One battered
            sunburst stamped into a breastplate that had seen better wars.
          </p>
          <p>Magnus had let them laugh. Laughter told you where a man kept his fear.</p>
          <p>
            The first came in proud and died surprised. The second tried to circle behind him and
            found the shield instead. After that, the hollow lost its shape. Ferns tore under boots.
            Someone screamed for a brother. Someone begged in a language Magnus did not know well
            enough to answer.
          </p>
          <p>Then three came at him together, and a knife found the gap beneath his arm.</p>
          <p>For one hard breath, the world narrowed to the warmth spreading under his mail.</p>
          <p>Not rage. Not panic.</p>
          <p>Recognition.</p>
          <p>
            The same feeling he had known as a boy, standing beside the forge while his father
            turned glowing iron with tongs. The metal never became what it wished to be. It became
            what it could endure.
          </p>
          <p>Calder's hammer answered in his hand.</p>
          <p>
            The Forgelight rose through him, stern and bright, and Magnus was no longer an old
            dwarf bleeding in a wet hollow. He was a door braced shut. He was a nail driven true.
            He was the last honest thing between frightened people and the dark.
          </p>
          <p>When it was finished, the rain began again.</p>
          <p>
            Now the hammer hung at his belt, heavier than any weapon had a right to be. Calder had
            carried it into the lower shaft years ago and never carried it out. Stone had swallowed
            him, along with seven good miners and the last easy laughter in Magnus's house.
          </p>
          <p>
            Since then, Magnus had trusted iron, fire, stone, and very little said by men in clean
            boots.
          </p>
          <p>
            At the village hall, the reeve waited with two guards and a purse that looked too light
            for the occasion.
          </p>
          <p>"You've done us a great service," the reeve said.</p>
          <p>Magnus took the purse, weighed it once, and gave a small grunt.</p>
          <p>"A service, aye."</p>
          <p>"There were many of them?"</p>
          <p>"Enough."</p>
          <p>The reeve looked past him toward the road.</p>
          <p>"And you were alone?"</p>
          <p>
            Magnus thought of the hammer at his belt. Of Calder's hand worn into the grip before
            his own. Of every dead man who had taught him the cost of standing somewhere useful.
          </p>
          <p>"No," he said at last. "Not alone."</p>
          <p>The reeve's eyes dropped to the hammer, then quickly away.</p>
          <p>
            Magnus stepped back into the cooling dusk. Behind him, someone barred the hall door
            softly, as if afraid the dark might hear.
          </p>
        </div>
      </div>
    </PanelFrame>
  );
}

const FAQS = [
  { q: 'Which games does Aftertale support?', a: "Aftertale is live today for World of Warcraft, with full capture support across Retail, Classic Era (including Hardcore and Season of Discovery), Cataclysm Classic, and Mists of Pandaria Classic. Aftertale is built as a game-agnostic storytelling layer, so additional games are on the roadmap. We avoid promising support for specific future titles until the capture, privacy, and writing experience meet the standard." },
  { q: 'Is my data private?', a: 'Your chronicle is treated as personal creative data. Aftertale is designed around your heroes, sessions, chapters, and account, not public feeds by default. Public hero pages are only part of the Loremaster identity tier, and publishing is an intentional choice, not a surprise.' },
  { q: 'What does BYOK mean?', a: 'BYOK means "bring your own key." On the Free tier, you provide your own AI API key and run the artisan path manually. It keeps the forever-free plan sustainable while giving you control over model usage, cost, and experimentation.' },
  { q: 'What is the difference between Free and Companion?', a: 'Free is for the hands-on player: one hero, manual flow, and your own AI key. Companion is the magic moment tier at $12/month: auto-capture, cloud processing, push notifications, and up to three heroes, so your chapter can arrive after play without extra ritual.' },
  { q: 'Can I cancel and keep my data?', a: 'Yes. Your story should not vanish because a billing cycle ended. If you cancel, you retain access to your existing chronicle and exported files where your tier supports exports. Paid features like automation, additional heroes, generation, and public pages may stop or downgrade after cancellation.' },
  { q: 'Can I read on my phone?', a: 'Yes. Aftertale is designed around the "new chapter ready" moment, which often happens away from the desk. Companion and higher tiers support push notifications, and your cloud chronicle is meant to be readable wherever you are signed in, including your phone.' },
  { q: 'What AI models do you use?', a: 'Aftertale uses modern large language models selected for narrative quality, reliability, and cost balance. Free uses your own key, so the provider depends on what you connect. Paid tiers use hosted generation, and model choices may evolve as better storytelling options become available.' },
];

function Faq() {
  return (
    <div className="at-faq-list">
      {FAQS.map((f) => (
        <details key={f.q} className="at-faq-item">
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}

function FooterCol({ heading, links }: { heading: string; links: string[] }) {
  return (
    <div className="at-footer-col">
      <h4>{heading}</h4>
      <ul>
        {links.map((l) => (
          <li key={l}><a href="#">{l}</a></li>
        ))}
      </ul>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Styles (scoped via .aftertale-landing root class)
// ----------------------------------------------------------------------------

const landingStyles = `
  .aftertale-landing {
    --at-bg: #0f0a1a;
    --at-bg-soft: #1a1230;
    --at-text: #f0e6d2;
    --at-text-soft: rgba(240, 230, 210, 0.78);
    --at-accent: #a47ad1;
    --at-accent-strong: #c79bf0;
    --at-border: rgba(255, 255, 255, 0.12);
    --at-card: rgba(255, 255, 255, 0.04);
    /* Landing-specific font stack — modern sans, no serif. The app keeps
       its leather-bound Crimson Pro, but marketing body copy needs to feel
       SaaS-modern, not Victorian. */
    --at-font-body: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --at-font-display: 'Cinzel', 'Georgia', serif;

    min-height: 100vh;
    background: radial-gradient(ellipse at top, #1a1230 0%, #0f0a1a 60%);
    color: var(--at-text);
    font-family: var(--at-font-body);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .aftertale-landing * { box-sizing: border-box; }

  .at-container {
    max-width: 1140px;
    margin: 0 auto;
    padding: 0 1.25rem;
  }

  /* ---- Header ---- */
  .at-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(15, 10, 26, 0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--at-border);
  }
  .at-header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
  }
  .at-logo {
    font-family: var(--at-font-display);
    font-size: 22px;
    font-weight: 700;
    color: var(--at-text);
    text-decoration: none;
    letter-spacing: 0.02em;
    display: inline-flex;
    align-items: center;
    margin: 0;
  }
  .at-logo-img {
    height: 44px;
    width: auto;
    display: block;
  }
  .at-logo-img-footer { height: 36px; opacity: 0.95; }
  .at-logo-mark { color: var(--at-accent); margin-right: 4px; }
  .at-nav { display: none; gap: 1.6rem; }
  .at-nav a {
    color: var(--at-text-soft);
    text-decoration: none;
    font-size: 14.5px;
    transition: color 0.15s;
  }
  .at-nav a:hover { color: var(--at-text); }
  .at-header-cta { display: flex; gap: 0.5rem; }
  @media (min-width: 760px) { .at-nav { display: flex; } }

  /* ---- Buttons ---- */
  .at-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.55rem 1rem;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .at-btn-lg { padding: 0.85rem 1.6rem; font-size: 16px; }
  .at-btn-primary {
    background: var(--at-accent);
    color: #1a0e2e;
  }
  .at-btn-primary:hover { background: var(--at-accent-strong); }
  .at-btn-secondary {
    background: transparent;
    color: var(--at-text);
    border-color: var(--at-border);
  }
  .at-btn-secondary:hover { border-color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.04); }
  .at-btn-ghost {
    background: transparent;
    color: var(--at-text-soft);
  }
  .at-btn-ghost:hover { color: var(--at-text); }

  /* ---- Hero ---- */
  .at-hero { padding: 5rem 0 4rem; text-align: center; }
  .at-hero-inner { max-width: 880px; margin: 0 auto; }
  .at-kicker {
    color: var(--at-accent);
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin: 0 0 1rem;
  }
  .at-kicker-center { text-align: center; }
  .at-hero-headline {
    font-family: var(--at-font-display);
    font-size: clamp(2.2rem, 5vw, 3.6rem);
    line-height: 1.1;
    margin: 0 0 1.25rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .at-hero-sub {
    font-size: 18px;
    color: var(--at-text-soft);
    margin: 0 auto 2rem;
    max-width: 640px;
    font-weight: 400;
    line-height: 1.6;
  }
  .at-hero-cta-row {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .at-trust {
    color: var(--at-text-soft);
    font-size: 13px;
    margin: 0;
  }

  /* ---- Sections ---- */
  .at-section { padding: 4rem 0; }
  .at-section-h2 {
    font-family: var(--at-font-display);
    font-size: clamp(1.8rem, 3.5vw, 2.4rem);
    margin: 0 0 0.75rem;
    line-height: 1.2;
  }
  .at-section-h2-center { text-align: center; margin-bottom: 2.5rem; }
  .at-section-sub-center {
    text-align: center;
    color: var(--at-text-soft);
    max-width: 600px;
    margin: -1.5rem auto 2.5rem;
    font-size: 16px;
  }
  .at-body { color: var(--at-text-soft); font-size: 16.5px; }

  /* ---- Magic moment ---- */
  .at-section-magic { background: rgba(255,255,255,0.02); border-block: 1px solid var(--at-border); }
  .at-magic-inner {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2.5rem;
    align-items: center;
  }
  .at-magic-copy { max-width: 540px; }
  @media (min-width: 880px) {
    .at-magic-inner { grid-template-columns: 1.1fr 0.9fr; }
  }

  /* ---- Phone mockup ---- */
  .at-phone {
    display: flex;
    justify-content: center;
  }
  .at-phone-frame {
    width: 280px;
    height: 560px;
    background: #0a0613;
    border-radius: 36px;
    border: 8px solid #2a1a3e;
    box-shadow: 0 30px 80px rgba(107, 74, 142, 0.4), 0 0 0 1px rgba(255,255,255,0.05) inset;
    position: relative;
    padding: 14px;
    overflow: hidden;
  }
  .at-phone-notch {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    width: 100px;
    height: 22px;
    background: #0a0613;
    border-radius: 12px;
    z-index: 2;
  }
  .at-phone-screen {
    padding: 50px 4px 4px;
    height: 100%;
    background: linear-gradient(180deg, #1a1230 0%, #0f0a1a 60%);
    border-radius: 24px;
  }
  .at-phone-notification {
    background: rgba(255,255,255,0.08);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 12px;
    margin: 0 6px;
  }
  .at-phone-app {
    margin: 0 0 4px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--at-accent);
  }
  .at-phone-title { margin: 0 0 4px; font-weight: 600; font-size: 14px; color: var(--at-text); }
  .at-phone-body { margin: 0; font-size: 12.5px; color: var(--at-text-soft); line-height: 1.4; }
  .at-phone-time { margin: 6px 0 0; font-size: 10.5px; color: rgba(240,230,210,0.4); text-align: right; }

  /* ---- How it works ---- */
  .at-how-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  @media (min-width: 760px) { .at-how-grid { grid-template-columns: repeat(3, 1fr); } }
  .at-how-step {
    padding: 1.5rem;
    border: 1px solid var(--at-border);
    border-radius: 12px;
    background: var(--at-card);
  }
  .at-how-number {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--at-accent);
    color: #1a0e2e;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1rem;
  }
  .at-how-step h3 { margin: 0 0 0.5rem; font-family: var(--at-font-display); font-size: 18px; }
  .at-how-step p { margin: 0; color: var(--at-text-soft); font-size: 14.5px; }

  /* ---- Onboarding (first-time activation) ---- */
  .at-section-onboard {
    background:
      radial-gradient(ellipse at 50% 0%, rgba(212, 163, 115, 0.05), rgba(0, 0, 0, 0) 60%),
      rgba(255, 255, 255, 0.015);
    border-block: 1px solid var(--at-border);
  }
  .at-onboard-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.25rem;
  }
  @media (min-width: 640px) { .at-onboard-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 1040px) { .at-onboard-grid { grid-template-columns: repeat(5, 1fr); gap: 1rem; } }
  .at-onboard-step {
    position: relative;
    padding: 1.5rem 1.25rem 1.4rem;
    border: 1px solid rgba(212, 163, 115, 0.22);
    border-radius: 14px;
    background:
      linear-gradient(180deg, rgba(212, 163, 115, 0.04), rgba(255, 255, 255, 0)) ,
      var(--at-card);
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  }
  .at-onboard-step:hover {
    transform: translateY(-2px);
    border-color: rgba(212, 163, 115, 0.45);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(212, 163, 115, 0.08);
  }
  .at-onboard-number {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid rgba(212, 163, 115, 0.55);
    background: rgba(212, 163, 115, 0.08);
    color: #e6c08a;
    font-family: var(--at-font-display);
    font-weight: 700;
    font-size: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.9rem;
    letter-spacing: 0;
  }
  .at-onboard-step h3 {
    margin: 0 0 0.5rem;
    font-family: var(--at-font-display);
    font-size: 17px;
    color: var(--at-text);
    letter-spacing: 0.01em;
  }
  .at-onboard-step p {
    margin: 0;
    color: var(--at-text-soft);
    font-size: 14px;
    line-height: 1.55;
  }
  .at-onboard-reassure {
    margin: 2.25rem auto 0;
    max-width: 640px;
    text-align: center;
    font-family: var(--at-font-display);
    font-style: italic;
    font-size: 16px;
    color: var(--at-text-soft);
    letter-spacing: 0.01em;
  }

  /* ---- Supported games block ---- */
  .at-supported {
    margin: 3rem auto 0;
    max-width: 1080px;
    text-align: center;
  }
  .at-supported-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    margin: 0 0 1.4rem;
    padding: 0.5rem 1.1rem;
    border: 1px solid rgba(111, 220, 156, 0.35);
    border-radius: 999px;
    background: rgba(111, 220, 156, 0.06);
    font-family: var(--at-font-display);
    font-size: 14px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--at-text);
  }
  .at-supported-pulse {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #6fdc9c;
    box-shadow: 0 0 0 0 rgba(111, 220, 156, 0.6);
    animation: at-supported-pulse 2.4s ease-out infinite;
  }
  @keyframes at-supported-pulse {
    0% { box-shadow: 0 0 0 0 rgba(111, 220, 156, 0.55); }
    70% { box-shadow: 0 0 0 10px rgba(111, 220, 156, 0); }
    100% { box-shadow: 0 0 0 0 rgba(111, 220, 156, 0); }
  }
  .at-supported-grid {
    display: none;
  }
  .at-supported-strip {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.55rem;
    margin: 0 auto;
    max-width: 880px;
  }
  .at-supported-pill {
    --pill-tone: 212, 163, 115;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.4rem 0.95rem 0.4rem 0.45rem;
    border-radius: 999px;
    border: 1px solid rgba(var(--pill-tone), 0.55);
    background:
      linear-gradient(180deg, rgba(var(--pill-tone), 0.14), rgba(var(--pill-tone), 0.04)),
      rgba(0, 0, 0, 0.4);
    transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
  }
  .at-supported-pill:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--pill-tone), 0.9);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(var(--pill-tone), 0.25);
  }
  .at-supported-pill-badge {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: rgba(var(--pill-tone), 0.95);
    color: #0d0817;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--at-font-display);
    font-size: 14px;
    font-weight: 700;
    box-shadow:
      0 0 0 1px rgba(var(--pill-tone), 0.45),
      0 0 10px rgba(var(--pill-tone), 0.5),
      inset 0 -1px 2px rgba(0, 0, 0, 0.3);
    flex-shrink: 0;
  }
  .at-supported-pill-label {
    font-family: var(--at-font-display);
    font-size: 13.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--at-text);
    white-space: nowrap;
  }

  /* Expansion color tones */
  .at-supported-pill-retail   { --pill-tone: 156, 122, 240; }  /* violet (Midnight era) */
  .at-supported-pill-classic  { --pill-tone: 214, 168, 70; }   /* amber gold (vanilla) */
  .at-supported-pill-hardcore { --pill-tone: 220, 78, 78; }    /* crimson (one life) */
  .at-supported-pill-sod      { --pill-tone: 102, 200, 220; }  /* cyan (rune discovery) */
  .at-supported-pill-cata     { --pill-tone: 214, 92, 60; }    /* Deathwing red-orange */
  .at-supported-pill-mists    { --pill-tone: 74, 186, 142; }   /* Pandaria jade */

  .at-supported-future {
    margin: 1.3rem 0 0;
    font-size: 12.5px;
    color: var(--at-text-soft);
    opacity: 0.72;
    letter-spacing: 0.02em;
  }

  /* ---- Features grid ---- */
  .at-features-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  @media (min-width: 600px) { .at-features-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 920px) { .at-features-grid { grid-template-columns: repeat(3, 1fr); } }
  .at-feature {
    padding: 1.3rem;
    border: 1px solid var(--at-border);
    border-radius: 12px;
    background: var(--at-card);
  }
  .at-feature h3 { margin: 0 0 0.45rem; font-size: 16px; font-weight: 600; color: var(--at-accent-strong); }
  .at-feature p { margin: 0; color: var(--at-text-soft); font-size: 14px; }

  /* ---- Sample chapter ---- */
  .at-section-sample { background: rgba(255,255,255,0.015); border-block: 1px solid var(--at-border); }
  .at-sample {
    max-width: 720px;
    margin: 0 auto;
    padding: 2.5rem 2rem;
    background: rgba(15, 10, 26, 0.6);
    border: 1px solid var(--at-border);
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  }
  .at-sample-title {
    font-family: var(--at-font-display);
    font-size: 26px;
    text-align: center;
    margin: 0 0 1.5rem;
    line-height: 1.2;
  }
  .at-sample-prose p {
    font-family: 'Crimson Pro', 'Georgia', serif;
    font-size: 17px;
    line-height: 1.75;
    color: var(--at-text);
    margin: 0 0 1rem;
  }

  /* ---- FAQ ---- */
  .at-faq-container { max-width: 760px; }
  .at-faq-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .at-faq-item {
    border: 1px solid var(--at-border);
    border-radius: 10px;
    background: var(--at-card);
    padding: 0 1.2rem;
  }
  .at-faq-item summary {
    cursor: pointer;
    padding: 1rem 0;
    font-weight: 600;
    list-style: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .at-faq-item summary::after {
    content: '+';
    color: var(--at-accent);
    font-size: 22px;
    line-height: 1;
  }
  .at-faq-item[open] summary::after { content: '−'; }
  .at-faq-item p { margin: 0 0 1.1rem; color: var(--at-text-soft); font-size: 15px; line-height: 1.6; }

  /* ---- CTA band ---- */
  .at-cta-band {
    background: linear-gradient(135deg, rgba(107,74,142,0.25), rgba(107,74,142,0.08));
    border-block: 1px solid var(--at-accent);
    padding: 3.5rem 0;
    text-align: center;
  }
  .at-cta-band h2 {
    font-family: var(--at-font-display);
    font-size: clamp(1.8rem, 3.5vw, 2.4rem);
    margin: 0 0 1.5rem;
  }

  /* ---- Footer ---- */
  .at-footer {
    padding: 3rem 0 1.5rem;
    border-top: 1px solid var(--at-border);
  }
  .at-footer-inner {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
  }
  @media (min-width: 760px) {
    .at-footer-inner { grid-template-columns: 1.2fr 2fr; }
  }
  .at-footer-tag { color: var(--at-text-soft); font-size: 14px; margin: 0.5rem 0 0; max-width: 320px; }
  .at-footer-cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
  }
  .at-footer-col h4 {
    margin: 0 0 0.75rem;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--at-text);
  }
  .at-footer-col ul { list-style: none; padding: 0; margin: 0; }
  .at-footer-col li { margin-bottom: 0.4rem; }
  .at-footer-col a { color: var(--at-text-soft); text-decoration: none; font-size: 14px; }
  .at-footer-col a:hover { color: var(--at-text); }
  .at-footer-legal {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
    color: var(--at-text-soft);
    font-size: 12.5px;
    margin-top: 2rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--at-border);
  }
  .at-footer-legal a { color: var(--at-text-soft); text-decoration: none; }
  .at-footer-legal a:hover { color: var(--at-text); }
  .at-footer-trademark {
    margin-top: 1rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--at-border);
    color: var(--at-text-soft);
    opacity: 0.65;
  }
  .at-footer-trademark p {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.55;
    max-width: 820px;
  }

  /* ---- Reveal animations ---- */
  .at-reveal {
    opacity: 0;
    transition:
      opacity 800ms cubic-bezier(0.22, 0.61, 0.36, 1),
      transform 800ms cubic-bezier(0.22, 0.61, 0.36, 1);
    will-change: opacity, transform;
  }
  .at-reveal-up { transform: translate3d(0, 28px, 0); }
  .at-reveal-in { transform: none !important; }
  .at-reveal-in.at-reveal { opacity: 1; }
  .at-reveal-left { transform: translate3d(-32px, 0, 0); }
  .at-reveal-right { transform: translate3d(32px, 0, 0); }
  .at-reveal-scale { transform: scale(0.96); }

  /* Hero entrance — fires immediately on mount, no IO needed */
  .at-hero-anim {
    opacity: 0;
    transform: translate3d(0, 18px, 0);
    animation: at-hero-in 900ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
  }
  @keyframes at-hero-in {
    to { opacity: 1; transform: translate3d(0, 0, 0); }
  }

  /* Phone gentle float */
  .at-phone-frame {
    animation: at-phone-float 6s ease-in-out infinite;
  }
  @keyframes at-phone-float {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-10px) rotate(-0.4deg); }
  }

  /* CTA band subtle glow pulse */
  .at-cta-band {
    position: relative;
    overflow: hidden;
  }
  .at-cta-band::before {
    content: '';
    position: absolute;
    inset: -50% -10% auto -10%;
    height: 200%;
    background: radial-gradient(ellipse at center, rgba(164, 122, 209, 0.18) 0%, transparent 60%);
    pointer-events: none;
    animation: at-glow 8s ease-in-out infinite;
  }
  @keyframes at-glow {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }

  /* Accessibility — kill all motion if requested */
  @media (prefers-reduced-motion: reduce) {
    .at-reveal,
    .at-hero-anim,
    .at-phone-frame,
    .at-cta-band::before {
      animation: none !important;
      transition: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
  }

  /* ---- HeroExhibit ---- */
  .at-exhibit {
    position: relative;
    max-width: 920px;
    margin: 2rem auto 0;
  }
  .at-exhibit-track {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    border: 1px solid var(--at-border);
    border-radius: 16px;
    background: rgba(0,0,0,0.35);
    box-shadow: 0 30px 80px rgba(0,0,0,0.45);
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .at-exhibit-track::-webkit-scrollbar { display: none; }
  .at-exhibit-page {
    flex: 0 0 100%;
    scroll-snap-align: start;
    min-height: 560px;
    padding: 2.5rem clamp(1.5rem, 5vw, 3.5rem);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .at-exhibit-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid var(--at-border);
    background: rgba(15,10,26,0.9);
    color: var(--at-text);
    font-size: 26px;
    line-height: 1;
    cursor: pointer;
    z-index: 5;
    transition: background 0.15s, opacity 0.15s, transform 0.15s;
    backdrop-filter: blur(8px);
  }
  .at-exhibit-nav:hover:not(:disabled) {
    background: var(--at-accent);
    color: #1a0e2e;
    transform: translateY(-50%) scale(1.05);
  }
  .at-exhibit-nav:disabled { opacity: 0.3; cursor: default; }
  .at-exhibit-nav-prev { left: -16px; }
  .at-exhibit-nav-next { right: -16px; }
  @media (max-width: 720px) {
    .at-exhibit-nav-prev { left: 8px; }
    .at-exhibit-nav-next { right: 8px; }
  }
  .at-exhibit-dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 1rem;
  }
  .at-exhibit-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.25);
    background: transparent;
    cursor: pointer;
    padding: 0;
    transition: all 0.15s;
  }
  .at-exhibit-dot:hover { border-color: var(--at-accent); }
  .at-exhibit-dot-active {
    background: var(--at-accent);
    border-color: var(--at-accent);
    width: 28px;
    border-radius: 5px;
  }
  .at-exhibit-hint {
    text-align: center;
    margin: 0.5rem 0 0;
    font-size: 12px;
    color: var(--at-text-soft);
    letter-spacing: 0.04em;
  }
  .at-exhibit-hint em { color: var(--at-accent-strong); font-style: normal; text-transform: uppercase; }

  /* Panel shared */
  .at-panel-kicker {
    color: var(--at-accent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    margin: 0 0 0.5rem;
  }
  .at-panel-headline {
    font-family: var(--at-font-display);
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    margin: 0 0 1rem;
    line-height: 1.2;
  }
  .at-panel-body {
    font-size: 16px;
    color: var(--at-text-soft);
    line-height: 1.6;
    margin: 0 0 1rem;
    max-width: 560px;
  }
  .at-panel-tagline {
    font-size: 15px;
    color: var(--at-text-soft);
    font-style: italic;
    line-height: 1.55;
    margin: 0;
    max-width: 480px;
  }
  .at-panel-footnote {
    font-size: 13px;
    color: var(--at-text-soft);
    margin: 1.5rem 0 0;
    opacity: 0.8;
  }

  /* Identity panel */
  .at-panel-identity {
    align-items: center;
    text-align: center;
  }
  .at-identity-sigil {
    margin-bottom: 1rem;
    filter: drop-shadow(0 8px 30px rgba(164,122,209,0.4));
  }
  .at-identity-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem 2rem;
    margin: 1.5rem 0;
    max-width: 460px;
    width: 100%;
  }
  .at-identity-stats > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--at-border);
    border-radius: 8px;
    background: rgba(255,255,255,0.02);
  }
  .at-identity-stats span {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--at-text-soft);
    margin-bottom: 4px;
  }
  .at-identity-stats strong {
    font-size: 14px;
    font-weight: 600;
  }

  /* Quote panel */
  .at-panel-quote {
    align-items: center;
    text-align: center;
    background: radial-gradient(ellipse at center, rgba(107,74,142,0.18) 0%, transparent 60%);
    border-radius: 16px;
  }
  .at-quote-mark {
    font-family: var(--at-font-display);
    font-size: 120px;
    line-height: 1;
    color: var(--at-accent);
    opacity: 0.4;
    margin-bottom: -30px;
  }
  .at-quote-text {
    font-family: var(--at-font-display);
    font-size: clamp(2rem, 5vw, 3.2rem);
    line-height: 1.25;
    margin: 0 0 1rem;
    max-width: 720px;
    font-weight: 500;
    color: var(--at-text);
    font-style: italic;
  }
  .at-quote-attrib {
    font-size: 13px;
    color: var(--at-text-soft);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0 0 2rem;
  }
  .at-quote-context {
    font-size: 15px;
    color: var(--at-text-soft);
    max-width: 480px;
    line-height: 1.6;
    margin: 0 0 0.9rem;
  }
  .at-quote-context:last-child { margin-bottom: 0; }
  .at-quote-gloss {
    margin-top: 1.4rem;
    padding: 1.2rem 1.6rem 1.3rem;
    border-left: 2px solid var(--at-accent-gold, #d4a373);
    background: linear-gradient(180deg, rgba(212,163,115,0.08), rgba(212,163,115,0.02));
    border-radius: 0 6px 6px 0;
    max-width: 520px;
  }
  .at-quote-context-gloss {
    color: var(--at-text);
    font-style: italic;
  }
  .at-quote-context-coda {
    font-family: var(--at-font-display);
    font-style: italic;
    color: var(--at-text);
    font-size: 17px;
    margin-top: 0.6rem;
    text-align: center;
  }
  .at-panel-kicker-center { text-align: center; }

  /* Voice panel */
  .at-voice-example {
    margin: 1.5rem 0;
    padding: 1.25rem 1.4rem;
    border-left: 3px solid var(--at-accent);
    background: rgba(0,0,0,0.4);
    border-radius: 0 8px 8px 0;
    max-width: 520px;
  }
  .at-voice-prompt {
    font-size: 14.5px;
    color: var(--at-text-soft);
    margin: 0 0 0.4rem;
    font-style: italic;
  }
  .at-voice-reply {
    font-family: 'Crimson Pro', 'Georgia', serif;
    font-size: 17px;
    color: var(--at-text);
    margin: 0 0 0.9rem;
    font-weight: 500;
  }
  .at-voice-reply:last-child { margin-bottom: 0; }

  /* Backstory panel */
  .at-backstory-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    margin-top: 1rem;
  }
  @media (min-width: 640px) { .at-backstory-grid { grid-template-columns: repeat(2, 1fr); } }
  .at-backstory-beat {
    padding: 1rem 1.1rem;
    border: 1px solid var(--at-border);
    border-radius: 10px;
    background: rgba(255,255,255,0.02);
    position: relative;
  }
  .at-backstory-num {
    color: var(--at-accent);
    font-family: var(--at-font-display);
    font-size: 12px;
    letter-spacing: 0.16em;
    font-weight: 700;
  }
  .at-backstory-beat h4 {
    margin: 0.3rem 0 0.4rem;
    font-family: var(--at-font-display);
    font-size: 17px;
    font-weight: 600;
  }
  .at-backstory-beat p {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    color: var(--at-text-soft);
  }

  /* Chapter panel */
  .at-panel-chapter {
    align-items: stretch;
    overflow: hidden;
  }
  .at-chapter-title {
    font-family: var(--at-font-display);
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    margin: 0.3rem 0 0.25rem;
    text-align: center;
    line-height: 1.2;
  }
  .at-chapter-meta {
    text-align: center;
    font-size: 11.5px;
    color: var(--at-text-soft);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0 0 1.5rem;
  }
  .at-chapter-prose {
    max-width: 600px;
    margin: 0 auto;
  }
  .at-chapter-prose p {
    font-family: 'Crimson Pro', 'Georgia', serif;
    font-size: 16.5px;
    line-height: 1.75;
    color: var(--at-text);
    margin: 0 0 1rem;
  }

  /* ---- Panel frame + atmosphere ---- */
  .at-panel-frame {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 1.75rem clamp(1.4rem, 4vw, 2.5rem);
    overflow: hidden;
    isolation: isolate;
    background:
      radial-gradient(ellipse 80% 60% at 50% 40%, rgba(107,74,142,0.08) 0%, transparent 70%),
      linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 100%);
  }
  .at-panel-frame-forge {
    background:
      radial-gradient(ellipse 70% 50% at 35% 65%, rgba(255,140,60,0.16) 0%, transparent 60%),
      radial-gradient(ellipse 60% 40% at 70% 30%, rgba(107,74,142,0.18) 0%, transparent 70%),
      linear-gradient(180deg, rgba(15,8,20,0.7) 0%, rgba(30,10,8,0.5) 100%);
  }
  .at-panel-frame-quote {
    background:
      radial-gradient(ellipse 60% 40% at 50% 50%, rgba(199,155,240,0.15) 0%, transparent 65%),
      linear-gradient(180deg, rgba(15,10,26,0.95) 0%, rgba(10,5,18,0.95) 100%);
  }
  .at-panel-content {
    position: relative;
    z-index: 2;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  /* Corner flourishes */
  .at-corner {
    position: absolute;
    z-index: 3;
    opacity: 0.7;
  }
  .at-corner-tl { top: 14px; left: 14px; }
  .at-corner-tr { top: 14px; right: 14px; }
  .at-corner-bl { bottom: 14px; left: 14px; }
  .at-corner-br { bottom: 14px; right: 14px; }

  /* Ember atmosphere */
  .at-ember-glow {
    position: absolute;
    inset: auto -10% -20% -10%;
    height: 60%;
    background: radial-gradient(ellipse at 50% 100%, rgba(255,160,80,0.28) 0%, rgba(255,100,50,0.1) 30%, transparent 70%);
    pointer-events: none;
    z-index: 1;
    filter: blur(8px);
    animation: at-ember-pulse 5s ease-in-out infinite;
  }
  .at-ember-glow-bottom {
    inset: auto -10% -10% -10%;
    height: 40%;
    background: radial-gradient(ellipse at 50% 100%, rgba(255,140,70,0.2) 0%, transparent 70%);
  }
  @keyframes at-ember-pulse {
    0%, 100% { opacity: 0.85; }
    50% { opacity: 1; }
  }

  .at-embers {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 1;
  }
  .at-ember {
    position: absolute;
    bottom: -10px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: radial-gradient(circle, #ffce6b 0%, #f08840 60%, transparent 100%);
    opacity: 0;
    animation: at-ember-rise 8s linear infinite;
    box-shadow: 0 0 6px rgba(255,180,90,0.7);
  }
  @keyframes at-ember-rise {
    0%   { transform: translateY(0) scale(1);   opacity: 0; }
    10%  { opacity: 0.9; }
    50%  { transform: translateY(-260px) translateX(20px) scale(0.8); opacity: 0.7; }
    100% { transform: translateY(-560px) translateX(-10px) scale(0.3); opacity: 0; }
  }

  /* ---- Identity panel ---- */
  .at-identity-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
    align-items: center;
    width: 100%;
  }
  @media (min-width: 720px) {
    .at-identity-layout { grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); gap: 2.5rem; }
  }
  .at-identity-card {
    position: relative;
    aspect-ratio: 3 / 4;
    max-width: 260px;
    margin: 0 auto;
    padding: 4px;
    background: linear-gradient(135deg, #c79bf0 0%, #6b4a8e 40%, #1a0e2e 100%);
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(107,74,142,0.5);
  }
  .at-identity-card-portrait {
    padding: 0;
    background: transparent;
    max-width: 320px;
    aspect-ratio: 1086 / 1448;
    overflow: hidden;
    border-radius: 18px;
    box-shadow:
      0 20px 60px rgba(107,74,142,0.45),
      0 0 0 1px rgba(199, 155, 240, 0.18);
  }
  .at-identity-portrait {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 18px;
  }
  .at-identity-card-inner {
    position: relative;
    height: 100%;
    background:
      radial-gradient(ellipse 80% 50% at 50% 70%, rgba(255,140,60,0.2) 0%, transparent 70%),
      linear-gradient(180deg, #1a1230 0%, #0a0612 100%);
    border-radius: 11px;
    padding: 1.2rem 1.2rem 1.4rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .at-card-stamp {
    margin: 0 0 0.6rem;
    font-size: 9.5px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--at-accent-strong);
    font-weight: 600;
  }
  .at-identity-sigil-wrap {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0.3rem 0;
  }
  .at-card-divider {
    width: 80%;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, #c79bf0 50%, transparent 100%);
    opacity: 0.5;
    margin: 0.6rem 0 0.6rem;
  }
  .at-card-attr {
    margin: 0;
    font-family: var(--at-font-display);
    font-size: 11.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--at-text-soft);
  }

  .at-identity-meta { padding: 0; }
  .at-identity-name {
    font-family: var(--at-font-display);
    font-size: clamp(2.8rem, 6vw, 4.4rem);
    line-height: 0.95;
    letter-spacing: -0.01em;
    margin: 0.25rem 0 0.5rem;
    background: linear-gradient(180deg, #fff5dc 0%, #d4b988 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    text-shadow: 0 4px 30px rgba(255,180,90,0.3);
  }
  .at-identity-rolecall {
    font-family: var(--at-font-display);
    font-size: 16px;
    letter-spacing: 0.05em;
    color: var(--at-accent-strong);
    margin: 0 0 1.5rem;
    font-style: italic;
  }
  .at-identity-stats-stacked {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-top: 1px solid rgba(255,255,255,0.1);
  }
  .at-stat-row {
    display: grid;
    grid-template-columns: 90px 1fr;
    align-items: baseline;
    gap: 1rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .at-stat-label {
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--at-text-soft);
    font-weight: 600;
  }
  .at-stat-value {
    font-family: 'Crimson Pro', 'Georgia', serif;
    font-size: 15.5px;
    color: var(--at-text);
    line-height: 1.4;
  }

  /* ---- Quote panel ---- */
  .at-quote-layout {
    text-align: center;
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.8rem;
  }
  .at-quote-flourish { opacity: 0.7; }
  .at-quote-flourish-top { margin-bottom: 0.5rem; }
  .at-quote-flourish-bottom { margin-top: 0.5rem; }
  .at-quote-text {
    font-family: var(--at-font-display);
    font-size: clamp(2.2rem, 6vw, 4rem);
    line-height: 1.15;
    margin: 0;
    color: var(--at-text);
    font-style: italic;
    font-weight: 500;
    letter-spacing: -0.005em;
    text-shadow: 0 4px 40px rgba(199,155,240,0.3);
  }
  .at-drop-quote {
    color: var(--at-accent);
    font-family: var(--at-font-display);
    font-size: 0.8em;
    line-height: 0;
    vertical-align: 0.4em;
    opacity: 0.85;
  }
  .at-drop-quote-close { vertical-align: -0.2em; }
  .at-quote-attrib {
    margin: 0.3rem 0 0;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--at-text-soft);
    font-weight: 500;
  }
  .at-quote-context {
    max-width: 520px;
    margin: 1.5rem 0 0;
    font-family: 'Crimson Pro', 'Georgia', serif;
    font-size: 16px;
    color: var(--at-text-soft);
    line-height: 1.65;
    font-style: italic;
  }

  /* ---- Voice panel ---- */
  .at-voice-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
    align-items: stretch;
    width: 100%;
  }
  @media (min-width: 760px) {
    .at-voice-layout { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 2.5rem; }
  }
  .at-voice-intro { display: flex; flex-direction: column; justify-content: center; }
  .at-voice-headline {
    font-family: var(--at-font-display);
    font-size: clamp(1.8rem, 3.2vw, 2.4rem);
    line-height: 1.15;
    margin: 0 0 1.2rem;
    display: flex;
    flex-direction: column;
  }
  .at-voice-headline span {
    display: block;
    background: linear-gradient(180deg, #fff5dc 0%, #d4b988 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .at-voice-body {
    font-family: 'Crimson Pro', 'Georgia', serif;
    font-size: 17px;
    line-height: 1.6;
    color: var(--at-text-soft);
    margin: 0;
  }
  .at-voice-transcript {
    background: rgba(0,0,0,0.45);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 1.4rem 1.4rem 1.2rem;
    display: flex;
    flex-direction: column;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .at-voice-stamp {
    margin: 0 0 1rem;
    text-align: center;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--at-text-soft);
    font-style: italic;
  }
  .at-voice-exchange { display: flex; flex-direction: column; gap: 0.9rem; }
  .at-voice-line p {
    margin: 0;
    font-family: 'Crimson Pro', 'Georgia', serif;
    font-size: 17px;
    line-height: 1.5;
  }
  .at-voice-speaker {
    display: block;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    margin-bottom: 2px;
    font-weight: 600;
  }
  .at-voice-line-other .at-voice-speaker { color: var(--at-text-soft); }
  .at-voice-line-other p { color: var(--at-text-soft); font-style: italic; }
  .at-voice-line-hero .at-voice-speaker { color: var(--at-accent); }
  .at-voice-line-hero p {
    color: var(--at-text);
    font-weight: 500;
    padding-left: 0.85rem;
    border-left: 2px solid var(--at-accent);
  }
  .at-voice-footnote {
    margin: 1.2rem 0 0;
    padding-top: 0.9rem;
    border-top: 1px solid rgba(255,255,255,0.08);
    font-size: 12.5px;
    color: var(--at-text-soft);
    text-align: center;
    font-style: italic;
  }

  /* ---- Backstory panel ---- */
  .at-backstory-layout { display: flex; flex-direction: column; gap: 1.5rem; height: 100%; }
  .at-backstory-header { text-align: center; }
  .at-backstory-headline {
    font-family: var(--at-font-display);
    font-size: clamp(1.6rem, 3vw, 2rem);
    margin: 0 0 0.5rem;
    line-height: 1.2;
  }
  .at-backstory-sub {
    margin: 0;
    font-size: 14px;
    color: var(--at-text-soft);
    max-width: 520px;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.55;
  }
  .at-backstory-timeline {
    position: relative;
    padding: 0.5rem 0 0 0;
    overflow-y: auto;
    flex: 1;
  }
  .at-timeline-spine {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 30px;
    width: 2px;
    background: linear-gradient(180deg, transparent 0%, #c79bf0 8%, #c79bf0 92%, transparent 100%);
    opacity: 0.35;
  }
  .at-timeline-beat {
    position: relative;
    display: grid;
    grid-template-columns: 60px 1fr;
    gap: 1rem;
    padding: 0.5rem 0 1rem;
    align-items: flex-start;
  }
  .at-timeline-marker {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #c79bf0 0%, #6b4a8e 70%, #2a1a40 100%);
    border: 2px solid #c79bf0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1a0e2e;
    font-family: var(--at-font-display);
    font-weight: 700;
    font-size: 20px;
    box-shadow: 0 0 20px rgba(199,155,240,0.5);
    z-index: 2;
    position: relative;
  }
  .at-timeline-content {
    padding-top: 0.4rem;
  }
  .at-timeline-year {
    margin: 0;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--at-accent-strong);
    font-weight: 600;
  }
  .at-timeline-content h4 {
    font-family: var(--at-font-display);
    margin: 0.2rem 0 0.35rem;
    font-size: 18px;
    color: var(--at-text);
  }
  .at-timeline-content p {
    margin: 0;
    font-family: 'Crimson Pro', 'Georgia', serif;
    font-size: 15.5px;
    line-height: 1.55;
    color: var(--at-text-soft);
  }

  /* ---- Chapter panel ---- */
  .at-chapter-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .at-chapter-head { text-align: center; flex-shrink: 0; margin-bottom: 1rem; }
  .at-chapter-title {
    font-family: var(--at-font-display);
    font-size: clamp(1.8rem, 3.5vw, 2.4rem);
    margin: 0.3rem 0 0.6rem;
    line-height: 1.2;
  }
  .at-chapter-rule {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.8rem;
    margin: 0.5rem auto 0.6rem;
    max-width: 320px;
  }
  .at-chapter-rule span:not(.at-chapter-rule-dot) {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(199,155,240,0.5) 50%, transparent 100%);
  }
  .at-chapter-rule-dot {
    color: var(--at-accent);
    font-size: 14px;
  }
  .at-chapter-meta {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--at-text-soft);
  }
  .at-chapter-prose {
    flex: 1;
    overflow-y: auto;
    max-width: 620px;
    margin: 0 auto;
    padding: 0 0.5rem;
  }
  .at-chapter-prose p {
    font-family: 'Crimson Pro', 'Georgia', serif;
    font-size: 17px;
    line-height: 1.75;
    color: var(--at-text);
    margin: 0 0 1rem;
  }
  .at-dropcap {
    float: left;
    font-family: var(--at-font-display);
    font-size: 3.6em;
    line-height: 0.85;
    padding: 0.05em 0.12em 0 0;
    color: var(--at-accent-strong);
    text-shadow: 0 2px 10px rgba(199,155,240,0.5);
  }

  /* Cap the exhibit page so all panels share a consistent, restrained height —
     the flex track would otherwise stretch every panel to match the tallest
     (Backstory). Anything taller gets internal scroll on .at-panel-content. */
  .at-exhibit-page {
    min-height: 640px;
    max-height: 700px;
    padding: 0;
  }
`;
