import { useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';
import './GoogleLoginButton.css';

const SCRIPT_ID = 'google-identity-script';
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const MIN_WIDTH = 200; // Google's allowed range
const MAX_WIDTH = 400;
const FRAME_SPACE = 8; // frame padding (3px x 2) + border (1px x 2)

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();

    let script = document.getElementById(SCRIPT_ID);

    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener(
      'error',
      () => {
        script.remove(); // allow a clean retry on next mount
        reject(new Error('Unable to load Google Sign-In.'));
      },
      { once: true }
    );
  });
}

export default function GoogleLoginButton({ onLogin }) {
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const onLoginRef = useRef(onLogin);

  const [status, setStatus] = useState('loading'); // loading | ready | signing-in
  const [error, setError] = useState('');

  useEffect(() => {
    onLoginRef.current = onLogin;
  }, [onLogin]);

  useEffect(() => {
    let cancelled = false;
    let observer;
    let lastWidth = 0;

    // Draw the Google button at the width of its container
    const draw = () => {
      const wrap = wrapRef.current;
      const holder = buttonRef.current;
      if (cancelled || !wrap || !holder || !window.google?.accounts?.id) return;

      const width = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, Math.floor(wrap.clientWidth) - FRAME_SPACE)
      );
      if (width === lastWidth) return;
      lastWidth = width;

      holder.replaceChildren();
      window.google.accounts.id.renderButton(holder, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width,
      });
    };

    const init = () => {
      if (cancelled) return;

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        setError('Google Client ID is missing from client/.env.');
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          setStatus('signing-in');
          setError('');

          try {
            const result = await apiRequest('/auth/google', {
              method: 'POST',
              body: { credential: response.credential },
            });

            onLoginRef.current({ token: result.token, user: result.user });
          } catch (err) {
            setError(err.message || 'Google login failed.');
          } finally {
            if (!cancelled) setStatus('ready');
          }
        },
      });

      setStatus('ready');
      draw();

      // Re-render when the card width changes (mobile rotate, resize)
      observer = new ResizeObserver(draw);
      observer.observe(wrapRef.current);
    };

    loadGoogleScript()
      .then(init)
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Google Sign-In could not be loaded. Refresh the page.');
        setStatus('ready');
      });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="google-login"
      aria-busy={status === 'signing-in'}
    >
      <div className="google-login__frame">
        <div ref={buttonRef} className="google-login__button" />
      </div>

      {status === 'loading' && !error && (
        <p className="google-login__status" role="status">
          <span className="google-login__spinner" aria-hidden="true" />
          Loading Google Sign-In…
        </p>
      )}

      {status === 'signing-in' && (
        <p className="google-login__status" role="status">
          <span className="google-login__spinner" aria-hidden="true" />
          Signing you in…
        </p>
      )}

      {error && (
        <p className="google-login__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}