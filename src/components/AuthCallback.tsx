import { useEffect, useState } from 'react';
import { exchangeCode } from '../lib/auth';

// Magic-link landing route (/auth/callback). Supabase redirects here with a
// ?code=… after the user clicks the email link; we exchange it for a session
// and send them on to the roster.
export function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { error } = await exchangeCode();
      if (!active) return;
      if (error) {
        setError(error);
        return;
      }
      // Land on the app. Replace so the callback URL leaves no history entry.
      window.location.replace('/#app');
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '2rem', textAlign: 'center',
      }}
    >
      {error ? (
        <>
          <h1 style={{ fontFamily: 'var(--font-display)' }}>That link didn’t work</h1>
          <p className="muted" style={{ maxWidth: 460, fontFamily: 'var(--font-body)', fontSize: 16 }}>
            {error} Open the link on the same device where you requested it, or request a fresh one.
          </p>
          <a href="/#app" className="at-btn at-btn-primary">Back to your chronicle</a>
        </>
      ) : (
        <>
          <h1 style={{ fontFamily: 'var(--font-display)' }}>Signing you in…</h1>
          <p className="muted" style={{ fontFamily: 'var(--font-body)', fontSize: 16 }}>
            One moment while we open your chronicle.
          </p>
        </>
      )}
    </div>
  );
}
