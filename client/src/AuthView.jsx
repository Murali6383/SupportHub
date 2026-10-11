import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { apiRequest } from './api';
import './AuthView.css';
import GoogleLoginButton from './GoogleLoginButton';

const initialResetToken =
  new URLSearchParams(window.location.search).get('resetToken') || '';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

const COUNTRIES = [
  { name: 'India', flag: '🇮🇳', code: '+91', iso: 'IN' },
  { name: 'United States', flag: '🇺🇸', code: '+1', iso: 'US' },
  { name: 'United Kingdom', flag: '🇬🇧', code: '+44', iso: 'GB' },
  { name: 'United Arab Emirates', flag: '🇦🇪', code: '+971', iso: 'AE' },
  { name: 'Singapore', flag: '🇸🇬', code: '+65', iso: 'SG' },
  { name: 'Canada', flag: '🇨🇦', code: '+1', iso: 'CA' },
  { name: 'Australia', flag: '🇦🇺', code: '+61', iso: 'AU' },
  { name: 'Sri Lanka', flag: '🇱🇰', code: '+94', iso: 'LK' },
  { name: 'Malaysia', flag: '🇲🇾', code: '+60', iso: 'MY' },
  { name: 'Germany', flag: '🇩🇪', code: '+49', iso: 'DE' },
  { name: 'France', flag: '🇫🇷', code: '+33', iso: 'FR' },
  { name: 'Japan', flag: '🇯🇵', code: '+81', iso: 'JP' },
  { name: 'China', flag: '🇨🇳', code: '+86', iso: 'CN' },
  { name: 'Bangladesh', flag: '🇧🇩', code: '+880', iso: 'BD' },
  { name: 'Pakistan', flag: '🇵🇰', code: '+92', iso: 'PK' },
  { name: 'Nepal', flag: '🇳🇵', code: '+977', iso: 'NP' },
  { name: 'Saudi Arabia', flag: '🇸🇦', code: '+966', iso: 'SA' },
  { name: 'South Africa', flag: '🇿🇦', code: '+27', iso: 'ZA' },
  { name: 'New Zealand', flag: '🇳🇿', code: '+64', iso: 'NZ' },
  { name: 'Ireland', flag: '🇮🇪', code: '+353', iso: 'IE' },
  { name: 'Italy', flag: '🇮🇹', code: '+39', iso: 'IT' },
  { name: 'Spain', flag: '🇪🇸', code: '+34', iso: 'ES' },
  { name: 'Brazil', flag: '🇧🇷', code: '+55', iso: 'BR' },
  { name: 'Mexico', flag: '🇲🇽', code: '+52', iso: 'MX' },
  { name: 'Indonesia', flag: '🇮🇩', code: '+62', iso: 'ID' },
  { name: 'Thailand', flag: '🇹🇭', code: '+66', iso: 'TH' },
  { name: 'South Korea', flag: '🇰🇷', code: '+82', iso: 'KR' },
  { name: 'Philippines', flag: '🇵🇭', code: '+63', iso: 'PH' },
  { name: 'Nigeria', flag: '🇳🇬', code: '+234', iso: 'NG' },
  { name: 'Kenya', flag: '🇰🇪', code: '+254', iso: 'KE' },
];

const AUTH_COPY = {
  password: {
    title: 'Welcome back',
    description: 'Sign in to your SupportHub account.',
    submit: 'Sign in',
  },
  register: {
    title: 'Create your account',
    description: 'Raise and track support tickets from one customer account.',
    submit: 'Create account',
  },
  'email-request': {
    title: 'Sign in with email',
    description: 'We will send a 6-digit verification code to your email.',
    submit: 'Send email code',
  },
  'email-verify': {
    title: 'Verify your email',
    description: 'Enter the six-digit code we just sent you.',
    submit: 'Verify and sign in',
  },
  'mobile-request': {
    title: 'Sign in with mobile',
    description: 'Choose your country and enter the number on your account.',
    submit: 'Send SMS code',
  },
  'mobile-verify': {
    title: 'Verify your mobile',
    description: 'Enter the SMS verification code we just sent you.',
    submit: 'Verify and sign in',
  },
  forgot: {
    title: 'Forgot password?',
    description: 'Enter your registered email to receive reset instructions.',
    submit: 'Send reset instructions',
  },
  reset: {
    title: 'Reset your password',
    description: 'Choose a new password for your account.',
    submit: 'Save new password',
  },
};

function digitsOnly(value, max = 32) {
  return String(value || '').replace(/\D/g, '').slice(0, max);
}

function passwordStrength(password) {
  if (!password) return { score: 0, label: 'Too short' };

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { score, label: 'Weak' };
  if (score <= 3) return { score, label: 'Fair' };
  if (score <= 4) return { score, label: 'Strong' };
  return { score, label: 'Excellent' };
}

export default function AuthView({ onLogin, message: sessionMessage = '' }) {
  const [mode, setMode] = useState(initialResetToken ? 'reset' : 'password');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [countryIso, setCountryIso] = useState('IN');
  const [countryQuery, setCountryQuery] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [code, setCode] = useState('');
  const [resetToken] = useState(initialResetToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resendIn, setResendIn] = useState(0);

  const formRef = useRef(null);
  const countryWrapRef = useRef(null);

  const selectedCountry =
    COUNTRIES.find((country) => country.iso === countryIso) || COUNTRIES[0];
  const fullPhone = `${selectedCountry.code}${phone}`;
  const copy = AUTH_COPY[mode];
  const strength = passwordStrength(password);

  const filteredCountries = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    if (!query) return COUNTRIES;

    return COUNTRIES.filter((country) =>
      `${country.name} ${country.code} ${country.iso}`
        .toLowerCase()
        .includes(query),
    );
  }, [countryQuery]);

  useEffect(() => {
    const firstField = formRef.current?.querySelector(
      'input:not([type="hidden"]), select, textarea',
    );
    firstField?.focus();
  }, [mode]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!countryWrapRef.current?.contains(event.target)) {
        setCountryOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function changeMode(nextMode) {
    setMode(nextMode);
    setError('');
    setMessage('');
    setCode('');
    setShowPassword(false);
    setCountryOpen(false);
    setCountryQuery('');
  }

  function startResendWindow() {
    setResendIn(RESEND_SECONDS);
  }

  function selectCountry(nextCountry) {
    setCountryIso(nextCountry.iso);
    setCountryOpen(false);
    setCountryQuery('');
    setError('');
    setMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;

    setError('');
    setMessage('');
    setLoading(true);

    const trimmedEmail = email.trim().toLowerCase();

    try {
      let result;

      switch (mode) {
        case 'password': {
          result = await apiRequest('/auth/login', {
            method: 'POST',
            body: { email: trimmedEmail, password },
          });
          onLogin({ token: result.token, user: result.user });
          break;
        }

        case 'register': {
          if (password.length < 8) {
            throw new Error('Password must contain at least 8 characters.');
          }

          if (password !== confirmPassword) {
            throw new Error('Passwords do not match.');
          }

          result = await apiRequest('/auth/register', {
            method: 'POST',
            body: { name: name.trim(), email: trimmedEmail, password },
          });

          setMessage(result.message || 'Account created. You can now sign in.');
          setMode('password');
          setPassword('');
          setConfirmPassword('');
          break;
        }

        case 'email-request': {
          result = await apiRequest('/auth/email-otp/request', {
            method: 'POST',
            body: { email: trimmedEmail },
          });
          setMessage(result.message || `Verification code sent to ${trimmedEmail}.`);
          setMode('email-verify');
          startResendWindow();
          break;
        }

        case 'email-verify': {
          if (code.length !== OTP_LENGTH) {
            throw new Error('Enter the 6-digit email verification code.');
          }

          result = await apiRequest('/auth/email-otp/verify', {
            method: 'POST',
            body: { email: trimmedEmail, code },
          });
          onLogin({ token: result.token, user: result.user });
          break;
        }

        case 'mobile-request': {
          const digits = digitsOnly(phone, 14);
          if (!digits) throw new Error('Please enter your mobile number.');
          if (digits.length < 4 || digits.length > 14) {
            throw new Error('Please check your mobile number.');
          }

          result = await apiRequest('/auth/mobile-otp/request', {
            method: 'POST',
            body: { phone: fullPhone },
          });
          setMessage(result.message || `Verification code requested for ${fullPhone}.`);
          setMode('mobile-verify');
          startResendWindow();
          break;
        }

        case 'mobile-verify': {
          if (!code.trim()) {
            throw new Error('Please enter your SMS verification code.');
          }

          result = await apiRequest('/auth/mobile-otp/verify', {
            method: 'POST',
            body: { phone: fullPhone, code },
          });
          onLogin({ token: result.token, user: result.user });
          break;
        }

        case 'forgot': {
          result = await apiRequest('/auth/forgot-password', {
            method: 'POST',
            body: { email: trimmedEmail },
          });
          setMessage(result.message || 'If that email exists, reset instructions were sent.');
          break;
        }

        case 'reset': {
          if (!resetToken) {
            throw new Error('Reset token is missing. Open the reset link from your email.');
          }
          if (password.length < 8) {
            throw new Error('Password must contain at least 8 characters.');
          }
          if (password !== confirmPassword) {
            throw new Error('Passwords do not match.');
          }

          result = await apiRequest('/auth/reset-password', {
            method: 'POST',
            body: { token: resetToken, newPassword: password },
          });

          window.history.replaceState({}, document.title, window.location.pathname);
          setPassword('');
          setConfirmPassword('');
          setMessage(result.message || 'Password updated. You can now sign in.');
          setMode('password');
          break;
        }

        default:
          throw new Error('Unsupported authentication option.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function renderFields() {
    switch (mode) {
      case 'password':
        return (
          <>
            <Field label="Email address">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field>
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </>
        );

      case 'register':
        return (
          <>
            <Field label="Full name">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="Your name"
                required
              />
            </Field>
            <Field label="Email address">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </Field>
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              minLength={8}
            />
            <PasswordStrength strength={strength} />
            <PasswordField
              label="Confirm password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
              autoComplete="new-password"
              placeholder="Re-enter password"
              minLength={8}
            />
          </>
        );

      case 'email-request':
      case 'forgot':
        return (
          <Field label="Email address">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </Field>
        );

      case 'email-verify':
        return (
          <OtpField
            label="Verification code"
            value={code}
            onChange={setCode}
            hint={`Sent to ${email || 'your email'}`}
          />
        );

      case 'mobile-request':
        return (
          <>
            <div className="auth-field" ref={countryWrapRef}>
              <span>Country / Region</span>
              <button
                type="button"
                className="auth-country-trigger"
                onClick={() => setCountryOpen((value) => !value)}
                aria-expanded={countryOpen}
                aria-haspopup="listbox"
              >
                <span>
                  {selectedCountry.flag} {selectedCountry.name}
                </span>
                <span className="auth-country-code">{selectedCountry.code}</span>
              </button>
              {countryOpen && (
                <div className="auth-country-menu" role="listbox">
                  <input
                    className="auth-country-search"
                    value={countryQuery}
                    onChange={(event) => setCountryQuery(event.target.value)}
                    placeholder="Search country or code"
                    aria-label="Search country"
                  />
                  <div className="auth-country-list">
                    {filteredCountries.map((country) => (
                      <button
                        type="button"
                        key={country.iso}
                        className={
                          country.iso === selectedCountry.iso
                            ? 'auth-country-option is-active'
                            : 'auth-country-option'
                        }
                        onClick={() => selectCountry(country)}
                      >
                        <span>
                          {country.flag} {country.name}
                        </span>
                        <span>{country.code}</span>
                      </button>
                    ))}
                    {filteredCountries.length === 0 && (
                      <p className="auth-country-empty">No matching countries</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Field label="Mobile number">
              <div className="auth-phone-input">
                <span className="auth-phone-code">
                  {selectedCountry.flag} {selectedCountry.code}
                </span>
                <input
                  type="tel"
                  autoComplete="tel-national"
                  inputMode="numeric"
                  value={phone}
                  onChange={(event) => setPhone(digitsOnly(event.target.value, 14))}
                  placeholder="Enter mobile number"
                  aria-label="Mobile number without country code"
                  required
                />
              </div>
              <small>Use the number already verified on your customer account.</small>
            </Field>
          </>
        );

      case 'mobile-verify':
        return (
          <OtpField
            label="SMS verification code"
            value={code}
            onChange={setCode}
            hint={`Sent to ${fullPhone}`}
          />
        );

      case 'reset':
        return (
          <>
            <PasswordField
              label="New password"
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              minLength={8}
            />
            <PasswordStrength strength={strength} />
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
              autoComplete="new-password"
              placeholder="Re-enter new password"
              minLength={8}
            />
          </>
        );

      default:
        return null;
    }
  }

  function renderActions() {
    const canResend = resendIn === 0;

    switch (mode) {
      case 'password':
        return (
          <>
            <button type="button" className="auth-link" onClick={() => changeMode('forgot')}>
              Forgot password?
            </button>

            <div className="auth-divider">
              <span>Or continue with</span>
            </div>

            <GoogleLoginButton onLogin={onLogin} />

            <div className="auth-alt-grid">
              <button
                type="button"
                className="auth-secondary"
                onClick={() => changeMode('mobile-request')}
              >
                <PhoneIcon /> Mobile OTP
              </button>
              <button
                type="button"
                className="auth-secondary"
                onClick={() => changeMode('email-request')}
              >
                <MailIcon /> Email OTP
              </button>
            </div>

            <p className="auth-switch">
              New to SupportHub?{' '}
              <button type="button" onClick={() => changeMode('register')}>
                Create account
              </button>
            </p>
          </>
        );

      case 'register':
        return (
          <p className="auth-switch">
            Already registered?{' '}
            <button type="button" onClick={() => changeMode('password')}>
              Sign in
            </button>
          </p>
        );

      case 'email-request':
        return (
          <button type="button" className="auth-link" onClick={() => changeMode('password')}>
            Back to password login
          </button>
        );

      case 'email-verify':
        return (
          <>
            <button
              type="button"
              className="auth-link"
              disabled={!canResend || loading}
              onClick={() => changeMode('email-request')}
            >
              {canResend ? 'Request another code' : `Resend in ${resendIn}s`}
            </button>
            <button type="button" className="auth-link" onClick={() => changeMode('password')}>
              Back to login
            </button>
          </>
        );

      case 'mobile-request':
      case 'mobile-verify':
        return (
          <>
            {mode === 'mobile-verify' && (
              <>
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => changeMode('mobile-request')}
                >
                  Change mobile number
                </button>
                <button
                  type="button"
                  className="auth-link"
                  disabled={!canResend || loading}
                  onClick={() => {
                    setCode('');
                    changeMode('mobile-request');
                  }}
                >
                  {canResend ? 'Request another code' : `Resend in ${resendIn}s`}
                </button>
              </>
            )}
            <p className="auth-note">
              Mobile login only works with a phone number already verified on your
              customer account.
            </p>
            <button type="button" className="auth-link" onClick={() => changeMode('password')}>
              Back to login
            </button>
          </>
        );

      case 'forgot':
      case 'reset':
        return (
          <button type="button" className="auth-link" onClick={() => changeMode('password')}>
            {mode === 'reset' ? 'Cancel and return to login' : 'Back to login'}
          </button>
        );

      default:
        return null;
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <div className="auth-logo">S</div>
          <span>SupportHub</span>
        </div>

        <div className="auth-brand-content">
          <span className="auth-eyebrow">Customer support platform</span>
          <h1>Support that keeps your business moving.</h1>
          <p>
            Manage requests, follow ticket progress, and stay connected with your
            support team from one secure workspace.
          </p>

          <ul className="auth-feature-list">
            <li>
              <CheckIcon /> Track tickets from open to resolved
            </li>
            <li>
              <CheckIcon /> Email, mobile, and Google sign-in
            </li>
            <li>
              <CheckIcon /> Built for customers and support teams
            </li>
          </ul>
        </div>

        <div className="auth-brand-footer">
          Secure access · Customer support · Ticket management
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <div className="auth-logo">S</div>
            <span>SupportHub</span>
          </div>

          <div className="auth-heading">
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
          </div>

          {(error || sessionMessage) && (
            <div className="auth-alert auth-alert-error" role="alert">
              {error || sessionMessage}
            </div>
          )}

          {message && (
            <div className="auth-alert auth-alert-success" role="status">
              {message}
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit} aria-busy={loading}>
            {renderFields()}

            <button type="submit" className="auth-primary" disabled={loading}>
              {loading ? 'Please wait…' : copy.submit}
            </button>
          </form>

          <div className="auth-actions">{renderActions()}</div>

          <p className="auth-legal">
            Protect your account. Never share verification codes with anyone.
          </p>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  placeholder,
  minLength,
}) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className="auth-password-wrap">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={minLength}
          required
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={onToggle}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </label>
  );
}

function PasswordStrength({ strength }) {
  return (
    <div className={`auth-strength is-${strength.label.toLowerCase()}`}>
      <div className="auth-strength-bars" aria-hidden="true">
        {[1, 2, 3, 4].map((level) => (
          <span key={level} className={strength.score >= level ? 'is-on' : ''} />
        ))}
      </div>
      <small>{strength.label}</small>
    </div>
  );
}

function OtpField({ label, value, onChange, hint }) {
  const baseId = useId();
  const boxes = Array.from({ length: OTP_LENGTH }, (_, index) => value[index] || '');

  function updateFromBoxes(nextBoxes) {
    onChange(nextBoxes.join('').slice(0, OTP_LENGTH));
  }

  function handleChange(index, raw) {
    const digit = digitsOnly(raw, 1);
    const next = [...boxes];
    next[index] = digit;
    updateFromBoxes(next);

    if (digit) {
      document.getElementById(`${baseId}-${index + 1}`)?.focus();
    }
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !boxes[index] && index > 0) {
      document.getElementById(`${baseId}-${index - 1}`)?.focus();
    }
  }

  function handlePaste(event) {
    event.preventDefault();
    onChange(digitsOnly(event.clipboardData.getData('text'), OTP_LENGTH));
  }

  return (
    <div className="auth-field">
      <span>{label}</span>
      <div className="auth-otp" onPaste={handlePaste}>
        {boxes.map((digit, index) => (
          <input
            key={index}
            id={`${baseId}-${index}`}
            className="auth-otp-box"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            value={digit}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            maxLength={1}
            required
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.3 13.3 5.2 10.2l1.4-1.4 1.7 1.7 5.1-5.1 1.4 1.4z"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 3v12h10V5H7z"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm8 7 8-5H4z"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 5c5 0 9.3 3.1 11 7-1.7 3.9-6 7-11 7S2.7 15.9 1 12c1.7-3.9 6-7 11-7zm0 3a4 4 0 1 0 .001 8.001A4 4 0 0 0 12 8z"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 4.3 4.3 3 21 19.7 19.7 21l-2.5-2.5A12.7 12.7 0 0 1 12 19C7 19 2.7 15.9 1 12c.6-1.4 1.6-2.8 2.8-3.9zm8.1 8.1a2.5 2.5 0 0 0 3.5 3.5zM12 5c5 0 9.3 3.1 11 7-.5 1.2-1.2 2.3-2.1 3.3L12 6.4z"
      />
    </svg>
  );
}