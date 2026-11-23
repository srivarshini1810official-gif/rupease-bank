
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, MenuItem, TextField } from '@mui/material';
import {
  ArrowLeftRight,
  Globe2,
  Landmark,
  List,
  LogOut,
  RefreshCw,
  Send,
  ShieldCheck,
  LockKeyhole,
  CheckCircle2,
  ArrowUpRight,
  LayoutDashboard,
  Wallet,
  History,
  Clock3,
} from 'lucide-react';

import { toPaise } from './amount';
import {
  configuredEndpoint,
  liveApi,
  parseEndpoint,
  readStorage,
  saveStorage,
} from './live-api';

import './live.css';

const money = minor =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(Number(minor || 0) / 100);

const time = value =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(value))
    : '—';

const statusNames = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  MANUAL_REVIEW: 'Manual review',
};

const rejectionNames = {
  INSUFFICIENT_FUNDS: 'Insufficient available balance',
  LIMIT_EXCEEDED: 'Transfer limit exceeded',
  DESTINATION_ACCOUNT_UNAVAILABLE: 'The destination is unavailable',
};

const byId = (directory, id) =>
  directory.find(bank => bank.bankId === id)?.bankName || id;


// --------------------------------------------------
// TRANSFER FORM
// --------------------------------------------------

function TransferForm({ bank, accounts, directory, send }) {
  const [type, setType] = useState('interbank');
  const [from, setFrom] = useState('');
  const [destination, setDestination] = useState('');
  const [number, setNumber] = useState('');
  const [amount, setAmount] = useState('200');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sources = accounts.filter(
    account => account.status === 'ACTIVE'
  );

  const fromId = sources.some(
    item => item.accountId === from
  )
    ? from
    : sources[0]?.accountId || '';

  const routes = directory.filter(
    item => item.bankId !== bank.id && item.status === 'ACTIVE'
  );

  const route = destination
    ? routes.find(item => item.ifsc === destination)?.ifsc || ''
    : routes[0]?.ifsc || '';

  const target = type === 'internal' ? bank.ifsc : route;

  async function submit(event) {
    event.preventDefault();
    setError('');

    const amountMinor = toPaise(amount);

    if (!fromId || !target || !number.trim() || amountMinor === null) {
      setError(
        'Choose a source, destination and positive amount with at most two decimal places.'
      );
      return;
    }

    setBusy(true);

    try {
      await send({
        fromAccountId: fromId,
        destinationIfsc: target,
        destinationAccountNumber: number.trim(),
        amountMinor,
        currency: 'INR',
      });

      setNumber('');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel live-transfer">
      <header className="panel-head">
        <div>
          <h2>Send a transfer</h2>
          <p>
            Transfer funds between accounts using the shared banking network.
          </p>
        </div>
        <Send size={19} />
      </header>

      <form className="transfer-form" onSubmit={submit}>
        <div className="type-switch">
          {[
            ['interbank', 'Interbank'],
            ['internal', 'Same bank'],
          ].map(([value, label]) => (
            <Button
              key={value}
              type="button"
              aria-pressed={type === value}
              variant={type === value ? 'contained' : 'outlined'}
              disabled={busy}
              onClick={() => setType(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <TextField
          select
          label="From account"
          required
          value={fromId}
          onChange={event => setFrom(event.target.value)}
          disabled={busy || !sources.length}
        >
          {sources.map(account => (
            <MenuItem
              key={account.accountId}
              value={account.accountId}
            >
              {account.accountNumber} · {money(account.availableMinor)} available
            </MenuItem>
          ))}
        </TextField>

        {type === 'interbank' && (
          <TextField
            select
            label="Destination bank"
            required
            value={route}
            onChange={event => setDestination(event.target.value)}
            disabled={busy || !routes.length}
          >
            {routes.map(item => (
              <MenuItem key={item.ifsc} value={item.ifsc}>
                {item.bankName} · {item.ifsc}
              </MenuItem>
            ))}
          </TextField>
        )}

        <TextField
          label="Destination account number"
          required
          value={number}
          onChange={event => setNumber(event.target.value)}
          disabled={busy}
        />

        <TextField
          label="Amount in INR"
          required
          value={amount}
          onChange={event => setAmount(event.target.value)}
          disabled={busy}
          slotProps={{
            htmlInput: { inputMode: 'decimal' },
          }}
        />

        {error && <Alert severity="error">{error}</Alert>}

        <div>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || !fromId || !target}
            startIcon={<Send size={16} />}
          >
            {busy ? 'Submitting…' : 'Submit transfer'}
          </Button>
        </div>
      </form>
    </section>
  );
}


// --------------------------------------------------
// TRANSACTION ACTIVITY
// --------------------------------------------------

function Activity({ rows, directory, compact = false }) {
  const displayedRows = compact ? rows.slice(0, 5) : rows;

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{compact ? 'Recent activity' : 'Transfer history'}</h2>
          <p>
            {compact
              ? 'Your five most recent transactions'
              : 'Latest 50 transfers for this user'}
          </p>
        </div>
        <List size={19} />
      </header>

      {displayedRows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Transfer</th>
                <th>Route</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {displayedRows.map(row => (
                <tr key={row.transferId}>
                  <td>
                    <strong>{row.transferId}</strong>
                    <small>{time(row.createdAt)}</small>
                  </td>

                  <td>
                    <strong>
                      {byId(directory, row.sourceBankId)} →{' '}
                      {byId(directory, row.destinationBankId)}
                    </strong>
                    <small>
                      {row.type === 'INTERNAL'
                        ? 'Same bank'
                        : row.direction === 'CREDIT'
                          ? 'Incoming'
                          : 'Outgoing'}
                    </small>
                  </td>

                  <td
                    className={
                      row.direction === 'CREDIT'
                        ? 'incoming amount'
                        : 'amount'
                    }
                  >
                    {money(row.amountMinor)}
                  </td>

                  <td>
                    <Chip
                      size="small"
                      label={statusNames[row.status] || row.status}
                      className={
                        row.status === 'COMPLETED'
                          ? 'completed'
                          : 'live-' + row.status?.toLowerCase()
                      }
                    />

                    {row.code && (
                      <small>
                        {rejectionNames[row.code] ||
                          row.code.toLowerCase().replaceAll('_', ' ')}
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <ArrowLeftRight size={23} />
          <strong>No transfers yet</strong>
          <p>Your transfers appear here when the Worker accepts them.</p>
        </div>
      )}
    </section>
  );
}


// --------------------------------------------------
// MAIN BANK APPLICATION
// --------------------------------------------------

export default function LiveBank({ bank, switchUrl, openDemo }) {
  const urlKey = 'x42-cloudflare-worker-url';

  const [base, setBase] = useState(
    () => configuredEndpoint || readStorage(localStorage, urlKey, '')
  );

  const [session, setSession] = useState(null);
  const prefix = '/banks/' + bank.id;

  const [url, setUrl] = useState(base);
  const [editUrl, setEditUrl] = useState(!base);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const [data, setData] = useState({
    accounts: [],
    transfers: [],
  });

  const [directory, setDirectory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');

  const activeToken = useRef(null);
  activeToken.current = session?.token;

  const pending = useRef(new Map());


  // --------------------------------------------------
  // REFRESH DASHBOARD INFORMATION
  // --------------------------------------------------

  const refresh = useCallback(async signal => {
    if (!session) return;

    try {
      const value = await liveApi(
        base,
        prefix + '/dashboard',
        {
          token: session.token,
          signal,
        }
      );

      if (
        signal?.aborted ||
        activeToken.current !== session.token
      ) {
        return;
      }

      setData(value);
      setLoaded(true);
      setError('');

    } catch (failure) {
      if (
        signal?.aborted ||
        activeToken.current !== session.token
      ) {
        return;
      }

      if (failure.status === 401) {
        setSession(null);
        setData({ accounts: [], transfers: [] });
        setLoaded(false);
      }

      setError(failure.message);
    }
  }, [base, prefix, session]);


  // --------------------------------------------------
  // AUTOMATIC ACCOUNT DATA REFRESH
  // --------------------------------------------------

  useEffect(() => {
    if (!session) return undefined;

    const controller = new AbortController();

    const update = () => {
      if (document.visibilityState === 'visible') {
        refresh(controller.signal);
      }
    };

    refresh(controller.signal);

    const timer = setInterval(update, 12_000);

    document.addEventListener('visibilitychange', update);

    return () => {
      clearInterval(timer);
      controller.abort();
      document.removeEventListener('visibilitychange', update);
    };
  }, [session, refresh]);


  // --------------------------------------------------
  // LOAD SHARED BANK DIRECTORY
  // --------------------------------------------------

  useEffect(() => {
    if (!session) return undefined;

    const controller = new AbortController();

    liveApi(base, '/directory/banks', {
      signal: controller.signal,
    })
      .then(value => setDirectory(value.banks || []))
      .catch(failure => {
        if (!controller.signal.aborted) {
          setError(failure.message);
        }
      });

    return () => controller.abort();
  }, [base, session]);


  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  function logout() {
    setSession(null);
    setLoaded(false);
    setData({ accounts: [], transfers: [] });
    setNote('');
    setError('');
    setActivePage('dashboard');
  }


  // --------------------------------------------------
  // FIREBASE-BACKED WORKER AUTHENTICATION
  // --------------------------------------------------

  async function signIn(event) {
    event.preventDefault();

    setBusy(true);
    setError('');

    try {
      const value = await liveApi(
        base,
        prefix + '/sign-in',
        {
          data: {
            email: email.trim(),
            password,
          },
        }
      );

      setSession(value);
      setActivePage('dashboard');

    } catch (failure) {
      setError(failure.message);

    } finally {
      setPassword('');
      setBusy(false);
    }
  }


  // --------------------------------------------------
  // CONFIGURE WORKER ENDPOINT
  // --------------------------------------------------

  function connect(event) {
    event.preventDefault();
    setError('');

    try {
      const endpoint = parseEndpoint(url);

      if (endpoint !== base) {
        logout();
        setDirectory([]);
      }

      saveStorage(localStorage, urlKey, endpoint);

      setBase(endpoint);
      setEditUrl(false);

    } catch (failure) {
      setError(failure.message);
    }
  }


  // --------------------------------------------------
  // TRANSFER SUBMISSION AND IDEMPOTENCY HANDLING
  // --------------------------------------------------

  async function send(transfer) {
    const raw = JSON.stringify([
      bank.id,
      base,
      session.uid,
      transfer,
    ]);

    const bytes = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(raw)
      )
    );

    const hash = Array.from(
      bytes,
      byte => byte.toString(16).padStart(2, '0')
    ).join('');

    const keyName = 'x42-pending-' + hash;

    const key =
      pending.current.get(keyName) ||
      readStorage(sessionStorage, keyName, null) ||
      crypto.randomUUID();

    pending.current.set(keyName, key);
    saveStorage(sessionStorage, keyName, key);

    const row = await liveApi(
      base,
      prefix + '/transfers',
      {
        token: session.token,
        data: transfer,
        key,
      }
    );

    pending.current.delete(keyName);
    saveStorage(sessionStorage, keyName, null);

    const verb =
      row.status === 'COMPLETED'
        ? 'Completed'
        : row.status === 'REJECTED'
          ? 'Rejected'
          : row.status === 'MANUAL_REVIEW'
            ? 'Manual review'
            : 'Accepted';

    setNote(verb + ' · ' + row.transferId);

    await refresh();
  }


  // --------------------------------------------------
  // DASHBOARD SUMMARY CALCULATIONS
  // --------------------------------------------------

  const totalAvailable = data.accounts.reduce(
    (sum, account) =>
      sum + Number(account.availableMinor || 0),
    0
  );

  const totalHeld = data.accounts.reduce(
    (sum, account) =>
      sum + Number(account.heldMinor || 0),
    0
  );

  const totalTransfers = data.transfers.length;

  const completedTransfers = data.transfers.filter(
    transfer => transfer.status === 'COMPLETED'
  ).length;


  // --------------------------------------------------
  // APPLICATION UI
  // --------------------------------------------------

  return (
    <div className="layout live-bank-layout">

      {/* LEFT SIDEBAR */}

      <aside className="sidebar">

        <div className="brand">
          <span className="brand-icon">
            <Landmark size={23} />
          </span>

          <span>
            <strong>{bank.wordmark}</strong>
            <small>BANKING PORTAL</small>
          </span>
        </div>


        {session && (
          <div className="sidebar-user">
            <span className="sidebar-user-icon">
              <LockKeyhole size={17} />
            </span>

            <span>
              <strong>Customer account</strong>
              <small>{session.email}</small>
            </span>
          </div>
        )}


        <nav className="sidebar-nav" aria-label="Main navigation">

          {session && (
            <>
              <p className="sidebar-section-label">BANKING</p>

              <button
                type="button"
                className={activePage === 'dashboard' ? 'active' : ''}
                onClick={() => setActivePage('dashboard')}
              >
                <LayoutDashboard size={18} />
                Dashboard
              </button>

              <button
                type="button"
                className={activePage === 'transfer' ? 'active' : ''}
                onClick={() => setActivePage('transfer')}
              >
                <Send size={18} />
                Transfers
              </button>

              <button
                type="button"
                className={activePage === 'history' ? 'active' : ''}
                onClick={() => setActivePage('history')}
              >
                <History size={18} />
                Transaction history
              </button>

              {/* FUTURE BANKING MODULES */}

              <button
                type="button"
                disabled
                className="nav-coming-soon"
              >
                <Wallet size={18} />
                Loans
                <span className="coming-soon">Coming Soon</span>
              </button>

              <button
                type="button"
                disabled
                className="nav-coming-soon"
              >
                <Landmark size={18} />
                Fixed Deposits
                <span className="coming-soon">Coming Soon</span>
              </button>

              <button
                type="button"
                disabled
                className="nav-coming-soon"
              >
                <ShieldCheck size={18} />
                Cards
                <span className="coming-soon">Coming Soon</span>
              </button>

              <button
                type="button"
                disabled
                className="nav-coming-soon"
              >
                <Clock3 size={18} />
                Bill Payments
                <span className="coming-soon">Coming Soon</span>
              </button>

              {/* REFRESH BALANCES - SEPARATE BUTTON */}

              <button
                type="button"
                onClick={() => refresh()}
              >
                <RefreshCw size={18} />
                Refresh balances
              </button>
            </>
          )}


          <p className="sidebar-section-label">SERVICES</p>

          {!configuredEndpoint && (
            <button
              type="button"
              className={editUrl ? 'active' : ''}
              onClick={() => {
                setUrl(base);
                setEditUrl(!editUrl);
              }}
            >
              <Globe2 size={18} />
              Worker connection
            </button>
          )}

          {openDemo && (
            <button
              type="button"
              onClick={openDemo}
            >
              <ArrowLeftRight size={18} />
              Browser demo
            </button>
          )}

          {session && (
            <>
              <div className="sidebar-divider"></div>

              <button
                type="button"
                className="sidebar-logout"
                onClick={logout}
              >
                <LogOut size={18} />
                Sign out
              </button>
            </>
          )}

        </nav>


        <a className="switch-link" href={switchUrl}>
          <Globe2 size={17} />
          SharedBank switch
          <ArrowUpRight size={15} className="switch-arrow" />
        </a>

      </aside>


      {/* MAIN CONTENT */}

      <div className="main">

        <header className="topbar">
          <div className="topbar-title">
            <strong>{bank.name}</strong>
            <span>{bank.id}</span>
          </div>

          <Chip
            label="Firestore test network"
            size="small"
            className="demo"
          />
        </header>


        <main
          className={
            'content live-bank-content' +
            (!session ? ' login-content' : '')
          }
        >

          {error && (
            <Alert
              severity="error"
              onClose={() => setError('')}
            >
              {error}
            </Alert>
          )}

          {note && (
            <Alert
              severity="info"
              onClose={() => setNote('')}
            >
              {note}
            </Alert>
          )}


          {/* PREMIUM LOGIN PAGE */}

          {!session ? (

            <div className="login-screen">

              <section className="login-intro">

                <div className="login-intro-top">

                  <div className="login-eyebrow">
                    <ShieldCheck size={16} />
                    SECURE DIGITAL BANKING
                  </div>

                  <h1>
                    Banking that moves
                    <span> with you.</span>
                  </h1>

                  <p className="login-description">
                    Welcome to {bank.name}. Experience
                    convenient banking with secure account
                    access and seamless money transfers.
                  </p>

                  <div className="login-features">

                    <div>
                      <span className="feature-icon">
                        <LockKeyhole size={18} />
                      </span>

                      <span>
                        <strong>Secure access</strong>
                        <small>Protected customer login</small>
                      </span>

                      <CheckCircle2
                        size={17}
                        className="feature-check"
                      />
                    </div>

                    <div>
                      <span className="feature-icon">
                        <ArrowLeftRight size={18} />
                      </span>

                      <span>
                        <strong>Easy transfers</strong>
                        <small>Banking within your network</small>
                      </span>

                      <CheckCircle2
                        size={17}
                        className="feature-check"
                      />
                    </div>

                    <div>
                      <span className="feature-icon">
                        <Landmark size={18} />
                      </span>

                      <span>
                        <strong>Account overview</strong>
                        <small>Access your banking information</small>
                      </span>

                      <CheckCircle2
                        size={17}
                        className="feature-check"
                      />
                    </div>

                  </div>
                </div>


                <div className="login-decoration">

                  <div className="decoration-orbit orbit-one"></div>
                  <div className="decoration-orbit orbit-two"></div>

                  <div className="decoration-card">

                    <div className="decoration-card-top">
                      <Landmark size={22} />
                      <span>RUPEASE BANK</span>
                    </div>

                    <div className="decoration-chip"></div>

                    <div className="decoration-card-bottom">
                      <span>YOUR BANKING. YOUR WAY.</span>
                      <ShieldCheck size={23} />
                    </div>

                  </div>

                </div>


                <div className="login-intro-footer">
                  <span>TRUSTED BANKING EXPERIENCE</span>
                  <span>RUPEASE · {bank.id}</span>
                </div>

              </section>


              {/* LOGIN FORM PANEL */}

              <div className="login-column">

                {editUrl && (
                  <section className="panel login-card connection-card">

                    <div className="login-card-heading">

                      <span className="login-card-icon">
                        <Globe2 size={21} />
                      </span>

                      <div>
                        <span className="login-card-kicker">
                          INITIAL SETUP
                        </span>

                        <h2>Connect your bank</h2>

                        <p>
                          Configure the shared banking service
                          before signing in.
                        </p>
                      </div>

                    </div>


                    <form
                      className="transfer-form login-form"
                      onSubmit={connect}
                    >

                      <TextField
                        label="Cloudflare Worker URL"
                        fullWidth
                        required
                        value={url}
                        onChange={event => setUrl(event.target.value)}
                      />

                      <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                      >
                        Save connection
                        <ArrowUpRight size={17} />
                      </Button>

                    </form>

                  </section>
                )}


                {!editUrl && base && (
                  <section className="panel login-card live-sign-in">

                    <div className="login-card-heading">

                      <span className="login-card-icon">
                        <LockKeyhole size={21} />
                      </span>

                      <div>
                        <span className="login-card-kicker">
                          CUSTOMER ACCESS
                        </span>

                        <h2>Welcome back</h2>

                        <p>
                          Sign in to access your {bank.name} account.
                        </p>
                      </div>

                    </div>


                    <form
                      className="transfer-form login-form"
                      onSubmit={signIn}
                    >

                      <TextField
                        label="Email address"
                        type="email"
                        autoComplete="username"
                        required
                        fullWidth
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                      />

                      <TextField
                        label="Password"
                        type="password"
                        autoComplete="current-password"
                        required
                        fullWidth
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                      />

                      <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        disabled={busy}
                        className="login-submit"
                      >
                        {busy ? 'Signing in…' : 'Sign in securely'}
                        {!busy && <ArrowUpRight size={18} />}
                      </Button>

                    </form>


                    <div className="login-security-note">
                      <ShieldCheck size={17} />

                      <span>
                        Secure sign-in using your bank's
                        Firebase test account.
                      </span>
                    </div>

                  </section>
                )}


                <div className="login-help">
                  <LockKeyhole size={15} />
                  <span>Your banking session is protected.</span>
                </div>

              </div>

            </div>

          ) : (

            /* CUSTOMER BANKING APPLICATION */

            <>

              {/* PAGE HEADER */}

              <div className="page-head">
                <div>
                  <span className="page-eyebrow">
                    CUSTOMER PORTAL
                  </span>

                  <h1>
                    {activePage === 'dashboard'
                      ? 'Dashboard'
                      : activePage === 'transfer'
                        ? 'Money transfers'
                        : 'Transaction history'}
                  </h1>

                  <p>Welcome back, {session.email}</p>
                </div>

                <Button
                  variant="outlined"
                  startIcon={<RefreshCw size={16} />}
                  onClick={() => refresh()}
                >
                  Refresh
                </Button>
              </div>


              {loaded && !data.accounts.length && (
                <Alert severity="info">
                  This Firebase user has no synthetic account
                  in this bank. Attach an account to this Firebase UID.
                </Alert>
              )}

              {!loaded && (
                <Alert severity="info">
                  Loading your accounts and activity…
                </Alert>
              )}


              {/* DASHBOARD PAGE */}

              {activePage === 'dashboard' && (

                <div className="dashboard-page">

                  {/* SUMMARY CARDS */}

                  <div className="summary-grid">

                    <section className="summary-card summary-primary">
                      <div className="summary-card-top">
                        <span>Total available balance</span>
                        <Wallet size={20} />
                      </div>

                      <strong>{money(totalAvailable)}</strong>

                      <small>
                        Across {data.accounts.length} account
                        {data.accounts.length === 1 ? '' : 's'}
                      </small>
                    </section>


                    <section className="summary-card">
                      <div className="summary-card-top">
                        <span>Held balance</span>
                        <LockKeyhole size={20} />
                      </div>

                      <strong>{money(totalHeld)}</strong>

                      <small>Funds currently on hold</small>
                    </section>


                    <section className="summary-card">
                      <div className="summary-card-top">
                        <span>Total transfers</span>
                        <ArrowLeftRight size={20} />
                      </div>

                      <strong>{totalTransfers}</strong>

                      <small>Transactions in your activity</small>
                    </section>


                    <section className="summary-card">
                      <div className="summary-card-top">
                        <span>Completed transfers</span>
                        <CheckCircle2 size={20} />
                      </div>

                      <strong>{completedTransfers}</strong>

                      <small>Successfully completed</small>
                    </section>

                  </div>


                  {/* ACCOUNT CARDS */}

                  <section className="dashboard-section">

                    <div className="section-heading">
                      <div>
                        <h2>Your accounts</h2>
                        <p>Overview of your linked bank accounts</p>
                      </div>

                      <Wallet size={20} />
                    </div>


                    {data.accounts.length > 0 ? (
                      <div className="accounts">

                        {data.accounts.map((account, index) => (
                          <section
                            key={account.accountId}
                            className={
                              'account-card ' +
                              (index === 0
                                ? 'primary-account'
                                : 'light-account')
                            }
                          >

                            <div className="account-head">
                              <span>{account.accountNumber}</span>
                              <Landmark size={19} />
                            </div>

                            <div className="account-value">
                              {money(account.availableMinor)}
                            </div>

                            <div className="account-foot">
                              <span>
                                Available · Held {money(account.heldMinor)}
                              </span>

                              <span>{account.accountId}</span>
                            </div>

                          </section>
                        ))}

                      </div>
                    ) : (
                      <div className="empty">
                        <Wallet size={23} />
                        <strong>No accounts available</strong>
                        <p>Your linked accounts will appear here.</p>
                      </div>
                    )}

                  </section>


                  {/* QUICK ACTIONS */}

                  <section className="dashboard-section quick-actions-section">

                    <div className="section-heading">
                      <div>
                        <h2>Quick actions</h2>
                        <p>Access your everyday banking services</p>
                      </div>
                    </div>

                    <div className="quick-actions">

                      <button
                        type="button"
                        className="quick-action"
                        onClick={() => setActivePage('transfer')}
                      >
                        <span className="quick-action-icon">
                          <Send size={20} />
                        </span>

                        <span>
                          <strong>Make a transfer</strong>
                          <small>Send money to another account</small>
                        </span>

                        <ArrowUpRight size={17} />
                      </button>


                      <button
                        type="button"
                        className="quick-action"
                        onClick={() => setActivePage('history')}
                      >
                        <span className="quick-action-icon">
                          <Clock3 size={20} />
                        </span>

                        <span>
                          <strong>View transactions</strong>
                          <small>Review your transfer activity</small>
                        </span>

                        <ArrowUpRight size={17} />
                      </button>

                    </div>

                  </section>


                  {/* RECENT TRANSACTIONS */}

                  <Activity
                    rows={data.transfers}
                    directory={directory}
                    compact
                  />

                  {data.transfers.length > 5 && (
                    <div className="view-all-row">
                      <Button
                        variant="outlined"
                        onClick={() => setActivePage('history')}
                      >
                        View all transactions
                        <ArrowUpRight size={16} />
                      </Button>
                    </div>
                  )}

                </div>

              )}


              {/* TRANSFER PAGE */}

              {activePage === 'transfer' && (

                <div className="transfer-page">

                  {data.accounts.length > 0 ? (
                    <TransferForm
                      bank={bank}
                      accounts={data.accounts}
                      directory={directory}
                      send={send}
                    />
                  ) : (
                    <section className="panel empty">
                      <Wallet size={25} />
                      <strong>No active account available</strong>
                      <p>
                        You need an active account to initiate a transfer.
                      </p>
                    </section>
                  )}

                  <section className="transfer-information">
                    <ShieldCheck size={19} />

                    <div>
                      <strong>Secure transfer processing</strong>
                      <p>
                        Transfers are submitted through the existing
                        banking Worker API. Transaction status is
                        displayed after the service processes your request.
                      </p>
                    </div>
                  </section>

                </div>

              )}


              {/* TRANSACTION HISTORY PAGE */}

              {activePage === 'history' && (

                <div className="history-page">

                  <div className="history-summary">
                    <div>
                      <span>Total transfers</span>
                      <strong>{totalTransfers}</strong>
                    </div>

                    <div>
                      <span>Completed</span>
                      <strong>{completedTransfers}</strong>
                    </div>

                    <div>
                      <span>Other statuses</span>
                      <strong>
                        {totalTransfers - completedTransfers}
                      </strong>
                    </div>
                  </div>

                  <Activity
                    rows={data.transfers}
                    directory={directory}
                  />

                </div>

              )}

            </>

          )}

        </main>

      </div>

    </div>
  );
}
