import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { apiRequest } from './api';
import AuthView from './AuthView';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
const SESSION_KEY = 'supporthub_session'; // the ONLY auth key now
const LEGACY_KEYS = ['token', 'user', 'support_auth']; // old keys, cleaned once
const ROLES = { CUSTOMER: 'CUSTOMER', SUPPORT: 'SUPPORT', ADMIN: 'ADMIN' };
const STATUSES = ['Open', 'In Progress', 'Resolved'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const NOTICE_MS = 5000;
const SKELETON_ROWS = [0, 1, 2, 3, 4];

const slug = (value = '') => String(value).toLowerCase().replaceAll(' ', '-');

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/* ------------------------------------------------------------------ */
/* Session helpers (sessionStorage only)                               */
/* ------------------------------------------------------------------ */
function loadSession() {
  try {
    LEGACY_KEYS.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const saved = JSON.parse(raw);
    if (saved?.token && saved?.user?.role) return saved;
  } catch {
    // corrupted JSON or storage blocked: fall through and clear
  }
  clearSession();
  return null;
}

function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // storage blocked: user stays signed in until refresh
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */
const ICON_PATHS = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
  close: 'M6 6l12 12M18 6L6 18',
  ticket: 'M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3v3zM13 6v12',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  check: 'M20 6L9 17l-5-5',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3.5-7z',
  chevron: 'M6 9l6 6 6-6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};

function Icon({ name, size = 18 }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function Alert({ type, children, onDismiss, action }) {
  return (
    <div
      className={`alert alert-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
    >
      <span className="alert-text">{children}</span>
      {action}
      {onDismiss && (
        <button
          type="button"
          className="alert-close"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-icon" aria-hidden="true">S</div>
      <div className="brand-text">
        <strong>SupportHub</strong>
        <span>Enterprise Portal</span>
      </div>
    </div>
  );
}

function PriorityChip({ priority }) {
  return (
    <span className={`chip priority-${slug(priority || 'Medium')}`}>
      {priority || 'Medium'}
    </span>
  );
}

function StatusChip({ status }) {
  return (
    <span className={`chip status-${slug(status || 'Open')}`}>
      {status || 'Open'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Login (legacy single-form view, kept as-is; App currently uses      */
/* AuthView for sign in / OTP / register / reset)                      */
/* ------------------------------------------------------------------ */
function LoginView({ onLogin, message }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password },
        fallbackMessage: 'Login failed. Check your credentials.',
      });

      if (!data?.token || !data?.user) {
        throw new Error('Invalid login response from the server.');
      }

      onLogin({ token: data.token, user: data.user }); // this screen unmounts
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual" aria-label="About SupportHub">
        <Brand />
        <div className="visual-content">
          <span className="eyebrow">Enterprise support platform</span>
          <h1>Customer support, organised in one place.</h1>
          <p>
            Raise requests, track progress and resolve issues with a clear
            view of every ticket.
          </p>
          <ul className="feature-list">
            <li>Secure account access</li>
            <li>Centralised ticket management</li>
            <li>Role-based access control</li>
          </ul>
        </div>
        <p className="visual-footer">SupportHub Enterprise Customer Support Portal</p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand">
            <Brand />
          </div>

          <div className="login-heading">
            <span className="eyebrow">Welcome back</span>
            <h2>Sign in to your account</h2>
            <p>Enter your credentials to access your workspace.</p>
          </div>

          {message && <Alert type="error">{message}</Alert>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="show-password"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && <Alert type="error">{error}</Alert>}

            <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="login-bottom">Need access? Contact your portal administrator.</p>
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard (all ticket state lives here; resets on sign out)         */
/* ------------------------------------------------------------------ */
function Dashboard({ session, onLogout, onSessionExpired }) {
  const { token, user } = session;
  const role = user.role;
  const isCustomer = role === ROLES.CUSTOMER;
  const canUpdateStatus = role === ROLES.SUPPORT || role === ROLES.ADMIN;

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState('');

  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  const controllerRef = useRef(null);
  const profileRef = useRef(null);
  const drawerCloseRef = useRef(null);

  /* ---------- load tickets: GET /tickets ---------- */
  const loadTickets = useCallback(
    // quiet   = background refresh: no spinner, keep any visible error
    // initial = first load on mount: state already starts as loading/no error
    async ({ quiet = false, initial = false } = {}) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      if (!quiet && !initial) {
        setLoading(true);
        setError('');
      }

      try {
        const data = await apiRequest('/tickets', {
          token,
          signal: controller.signal,
        });
        if (!Array.isArray(data)) {
          throw new Error('Unexpected ticket data returned by the server.');
        }
        setTickets(data);
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (err.status === 401) {
          onSessionExpired();
          return;
        }
        if (!quiet) setError(err.message || 'Unable to fetch tickets.');
      } finally {
        if (controllerRef.current === controller && !quiet) setLoading(false);
      }
    },
    [token, onSessionExpired],
  );

  useEffect(() => {
    loadTickets({ initial: true });
    return () => controllerRef.current?.abort(); // cancel on sign out / unmount
  }, [loadTickets]);

  /* ---------- success notice auto-dismiss ---------- */
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  /* ---------- Escape closes mobile menu, profile menu, drawer, modal ---------- */
  useEffect(() => {
    if (!menuOpen && !profileOpen && !selectedId && !showForm) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (showForm) {
        if (!saving) setShowForm(false);
      } else if (selectedId) {
        setSelectedId('');
      } else if (profileOpen) {
        setProfileOpen(false);
      } else {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, profileOpen, selectedId, showForm, saving]);

  /* ---------- click outside closes profile menu ---------- */
  useEffect(() => {
    if (!profileOpen) return undefined;
    const onPointerDown = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [profileOpen]);

  /* ---------- move focus into the details drawer when it opens ---------- */
  useEffect(() => {
    if (selectedId) drawerCloseRef.current?.focus();
  }, [selectedId]);

  /* ---------- create ticket: POST /tickets ---------- */
  async function createTicket(event) {
    event.preventDefault();

    const cleanSubject = subject.trim();
    if (!cleanSubject) {
      setError('Please enter an issue summary.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      // Customer name/identity comes from the token on the backend.
      const data = await apiRequest('/tickets', {
        method: 'POST',
        token,
        body: { subject: cleanSubject, priority },
        fallbackMessage: 'Ticket creation failed.',
      });

      const created = data?.ticket || (data?._id ? data : null);
      if (created) {
        setTickets((current) => [
          created,
          ...current.filter((ticket) => ticket._id !== created._id),
        ]);
      } else {
        await loadTickets({ quiet: true });
      }

      setSubject('');
      setPriority('Medium');
      setShowForm(false);
      setNotice('Ticket created successfully.');
    } catch (err) {
      if (err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(err.message || 'Unable to create ticket.');
    } finally {
      setSaving(false);
    }
  }

  /* ---------- update status: PATCH /tickets/:mongoId ---------- */
  async function updateStatus(ticket, status) {
    if (!canUpdateStatus) {
      setError('Only Support and Admin users can update ticket status.');
      return;
    }

    setError('');
    setNotice('');
    setUpdatingId(ticket._id);

    try {
      // PATCH needs the MongoDB _id, not the display id like TKT-1002.
      const data = await apiRequest(`/tickets/${encodeURIComponent(ticket._id)}`, {
        method: 'PATCH',
        token,
        body: { status },
        fallbackMessage: 'Status update failed.',
      });

      const updated = data?.ticket || (data?._id ? data : null);
      setTickets((current) =>
        current.map((item) =>
          item._id === ticket._id
            ? updated
              ? { ...item, ...updated }
              : { ...item, status }
            : item,
        ),
      );
      setNotice(`${ticket.ticketId} status updated to ${status}.`);
    } catch (err) {
      if (err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(err.message || 'Unable to update ticket status.');
      await loadTickets({ quiet: true }); // refresh data, keep the error visible
    } finally {
      setUpdatingId('');
    }
  }

  /* ---------- derived data ---------- */
  const counts = useMemo(
    () => ({
      All: tickets.length,
      Open: tickets.filter((t) => t.status === 'Open').length,
      'In Progress': tickets.filter((t) => t.status === 'In Progress').length,
      Resolved: tickets.filter((t) => t.status === 'Resolved').length,
    }),
    [tickets],
  );

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesSearch = [ticket.ticketId, ticket.subject, ticket.customer].some(
        (value) => String(value || '').toLowerCase().includes(query),
      );
      const matchesFilter = statusFilter === 'All' || ticket.status === statusFilter;
      return matchesSearch && matchesFilter;
    });
  }, [tickets, search, statusFilter]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket._id === selectedId) || null,
    [tickets, selectedId],
  );

  const navItems = [
    { label: 'All tickets', value: 'All' },
    { label: 'Open', value: 'Open' },
    { label: 'In progress', value: 'In Progress' },
    { label: 'Resolved', value: 'Resolved' },
  ];

  const hasTickets = tickets.length > 0;
  const hasActiveFilter = search.trim() !== '' || statusFilter !== 'All';
  const emptyTitle = hasTickets ? 'No matching tickets' : 'No tickets yet';
  const emptyText = hasTickets
    ? 'No tickets match your search or filter.'
    : isCustomer
      ? 'You have not created any tickets yet.'
      : 'There are no tickets yet.';

  const displayName = user.name || 'Portal user';
  const firstName = displayName.split(' ')[0];
  const initials = (user.name || 'U').slice(0, 2).toUpperCase();

  function clearFilters() {
    setSearch('');
    setStatusFilter('All');
  }

  function renderStatusControl(ticket, idSuffix = '') {
    if (!canUpdateStatus) return <StatusChip status={ticket.status} />;
    const statusOptions = STATUSES.includes(ticket.status)
      ? STATUSES
      : [ticket.status, ...STATUSES];
    return (
      <select
        className={`status-select select-${slug(ticket.status || 'Open')}`}
        value={ticket.status}
        disabled={updatingId === ticket._id}
        onChange={(event) => updateStatus(ticket, event.target.value)}
        aria-label={`Status for ${ticket.ticketId}${idSuffix}`}
      >
        {statusOptions.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
    );
  }

  const errorAlert = error && (
    <Alert
      type="error"
      onDismiss={() => setError('')}
      action={
        !showForm && (
          <button type="button" className="btn btn-secondary btn-small" onClick={() => loadTickets()}>
            Retry
          </button>
        )
      }
    >
      {error}
    </Alert>
  );

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to main content</a>

      {menuOpen && (
        <div className="overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`} id="sidebar">
        <Brand />

        <nav aria-label="Ticket views">
          <p className="menu-label">Tickets</p>
          {navItems.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`nav-item ${statusFilter === item.value ? 'active' : ''}`}
              aria-current={statusFilter === item.value ? 'page' : undefined}
              onClick={() => {
                setStatusFilter(item.value);
                setMenuOpen(false);
              }}
            >
              <span>{item.label}</span>
              <span className="nav-count">{counts[item.value]}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="avatar" aria-hidden="true">{initials}</div>
          <div className="sidebar-user">
            <strong>{displayName}</strong>
            <span>{role}</span>
          </div>
          <button type="button" className="logout-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main" id="main-content">
        <header className="topbar">
          <button
            type="button"
            className="menu-btn"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            aria-controls="sidebar"
          >
            <Icon name="menu" />
          </button>

          <div className="topbar-title">
            <h1>
              {isCustomer
                ? `Welcome back, ${firstName}`
                : 'Customer support dashboard'}
            </h1>
            <p>
              {isCustomer
                ? 'Create and track your support requests.'
                : 'Monitor and manage customer issues in one place.'}
            </p>
          </div>

          <div className="topbar-actions">
            {isCustomer && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowForm(true)}
                aria-haspopup="dialog"
              >
                <Icon name="plus" />
                <span>Create ticket</span>
              </button>
            )}

            <div className="profile" ref={profileRef}>
              <button
                type="button"
                className="profile-btn"
                onClick={() => setProfileOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                aria-label="Account menu"
              >
                <span className="avatar avatar-sm" aria-hidden="true">{initials}</span>
                <span className="profile-name">{displayName}</span>
                <Icon name="chevron" size={16} />
              </button>

              {profileOpen && (
                <div className="profile-menu" role="menu">
                  <div className="profile-menu-head">
                    <strong>{displayName}</strong>
                    {user.email && <span>{user.email}</span>}
                    <span className="role-badge">{role}</span>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="profile-menu-item"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                  >
                    <Icon name="logout" size={16} />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="messages">
          {!showForm && errorAlert}
          {notice && (
            <Alert type="success" onDismiss={() => setNotice('')}>
              {notice}
            </Alert>
          )}
        </div>

        <section className="stats" aria-label="Ticket summary">
          <article className="stat-card">
            <span className="stat-icon tone-blue"><Icon name="ticket" /></span>
            <div className="stat-body">
              <span>Total tickets</span>
              <strong>{counts.All}</strong>
              <small>{isCustomer ? 'Your tickets' : 'All visible tickets'}</small>
            </div>
          </article>
          <article className="stat-card">
            <span className="stat-icon tone-slate"><Icon name="inbox" /></span>
            <div className="stat-body">
              <span>Open</span>
              <strong>{counts.Open}</strong>
              <small>Awaiting support</small>
            </div>
          </article>
          <article className="stat-card">
            <span className="stat-icon tone-amber"><Icon name="clock" /></span>
            <div className="stat-body">
              <span>In progress</span>
              <strong>{counts['In Progress']}</strong>
              <small>Being handled</small>
            </div>
          </article>
          <article className="stat-card">
            <span className="stat-icon tone-green"><Icon name="check" /></span>
            <div className="stat-body">
              <span>Resolved</span>
              <strong>{counts.Resolved}</strong>
              <small>Completed</small>
            </div>
          </article>
        </section>

        <section className="panel" id="tickets" aria-labelledby="tickets-heading">
          <div className="panel-header">
            <div>
              <h2 id="tickets-heading">
                {isCustomer ? 'Your tickets' : 'Support tickets'}
              </h2>
              <p>
                {canUpdateStatus
                  ? 'Review issues and update their status.'
                  : 'Track the progress of your requests.'}
              </p>
            </div>
          </div>

          <div className="toolbar">
            <div className="search-box">
              <Icon name="search" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by ticket ID, issue or customer"
                aria-label="Search tickets"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter tickets by status"
            >
              <option value="All">All statuses</option>
              {STATUSES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="table-wrap" aria-busy={loading}>
            <table>
              <caption className="sr-only">Support tickets</caption>
              <thead>
                <tr>
                  <th scope="col">Ticket ID</th>
                  <th scope="col">Issue</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  SKELETON_ROWS.map((row) => (
                    <tr key={row} className="skeleton-row" aria-hidden="true">
                      <td data-label="Ticket ID"><span className="skeleton w-60" /></td>
                      <td data-label="Issue"><span className="skeleton w-100" /></td>
                      <td data-label="Customer"><span className="skeleton w-80" /></td>
                      <td data-label="Priority"><span className="skeleton w-50" /></td>
                      <td data-label="Status"><span className="skeleton w-50" /></td>
                      <td data-label="Actions"><span className="skeleton w-40" /></td>
                    </tr>
                  ))
                ) : filteredTickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      <div className="empty-state">
                        <span className="empty-icon"><Icon name="inbox" size={24} /></span>
                        <strong>{emptyTitle}</strong>
                        <p>{emptyText}</p>
                        {hasTickets && hasActiveFilter && (
                          <button type="button" className="btn btn-secondary btn-small" onClick={clearFilters}>
                            Clear filters
                          </button>
                        )}
                        {!hasTickets && isCustomer && (
                          <button type="button" className="btn btn-primary btn-small" onClick={() => setShowForm(true)}>
                            <Icon name="plus" size={16} />
                            <span>Create your first ticket</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTickets.map((ticket) => (
                    <tr key={ticket._id}>
                      <td data-label="Ticket ID" className="ticket-id">{ticket.ticketId}</td>
                      <td data-label="Issue" className="ticket-subject">{ticket.subject}</td>
                      <td data-label="Customer">{ticket.customer}</td>
                      <td data-label="Priority">
                        <PriorityChip priority={ticket.priority} />
                      </td>
                      <td data-label="Status">{renderStatusControl(ticket)}</td>
                      <td data-label="Actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => setSelectedId(ticket._id)}
                          aria-label={`View details for ${ticket.ticketId}`}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="table-footer" aria-live="polite">
            {loading
              ? ''
              : `Showing ${filteredTickets.length} of ${tickets.length} tickets`}
          </p>
        </section>

        <footer className="page-footer">SupportHub · Enterprise Customer Support Portal</footer>
      </main>

      {/* ---------- Create ticket modal ---------- */}
      {showForm && isCustomer && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setShowForm(false);
          }}
        >
          <form
            className="modal"
            onSubmit={createTicket}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-ticket-title"
          >
            <div className="modal-header">
              <div>
                <h2 id="create-ticket-title">Create a support ticket</h2>
                <p>Tell us what is wrong and how urgent it is.</p>
              </div>
              <button
                type="button"
                className="alert-close"
                onClick={() => setShowForm(false)}
                disabled={saving}
                aria-label="Close dialog"
              >
                <Icon name="close" />
              </button>
            </div>

            {errorAlert}

            <div className="form-group">
              <label htmlFor="subject">Issue summary</label>
              <input
                id="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Briefly describe the issue"
                maxLength={200}
                required
                autoFocus
              />
              <span className="field-hint">{subject.length}/200 characters</span>
            </div>

            <div className="form-group">
              <label htmlFor="priority">Priority</label>
              <select
                id="priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                {PRIORITIES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div className="form-actions modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Submit ticket'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------- Ticket details drawer ---------- */}
      {selectedTicket && (
        <div
          className="drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedId('');
          }}
        >
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-details-title"
          >
            <div className="drawer-header">
              <div>
                <span className="drawer-id">{selectedTicket.ticketId}</span>
                <h2 id="ticket-details-title">{selectedTicket.subject}</h2>
              </div>
              <button
                type="button"
                className="alert-close"
                onClick={() => setSelectedId('')}
                ref={drawerCloseRef}
                aria-label="Close ticket details"
              >
                <Icon name="close" />
              </button>
            </div>

            {error && <Alert type="error" onDismiss={() => setError('')}>{error}</Alert>}

            <dl className="details">
              <div>
                <dt>Status</dt>
                <dd>{renderStatusControl(selectedTicket, ' (details)')}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd><PriorityChip priority={selectedTicket.priority} /></dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>{selectedTicket.customer || 'Not available'}</dd>
              </div>
              {formatDate(selectedTicket.createdAt) && (
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(selectedTicket.createdAt)}</dd>
                </div>
              )}
              {formatDate(selectedTicket.updatedAt) && (
                <div>
                  <dt>Last updated</dt>
                  <dd>{formatDate(selectedTicket.updatedAt)}</dd>
                </div>
              )}
            </dl>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Root: decides Login vs Dashboard                                    */
/* ------------------------------------------------------------------ */
export default function App() {
  const [session, setSession] = useState(loadSession);
  const [sessionMessage, setSessionMessage] = useState('');

  const handleLogin = useCallback((newSession) => {
    saveSession(newSession);
    setSessionMessage('');
    setSession(newSession);
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    setSessionMessage('');
    setSession(null);
  }, []);

  const handleSessionExpired = useCallback(() => {
    clearSession();
    setSessionMessage('Your session has expired. Please sign in again.');
    setSession(null);
  }, []);

  if (!session) {
    // `message` is extra: AuthView can show it if it supports it, ignores it otherwise
    return <AuthView onLogin={handleLogin} message={sessionMessage} />;
  }

  return (
    <Dashboard
      session={session}
      onLogout={handleLogout}
      onSessionExpired={handleSessionExpired}
    />
  );
}