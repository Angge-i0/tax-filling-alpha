import { useState } from 'react';
import { Bell, Eye, EyeOff, X } from 'lucide-react';
import { apiPost, saveTokens } from './api';
import logo from './assets/Municipality of San Pascual.jpg';

function PasswordInput({ value, onChange, placeholder, show, onToggle, required, autoFocus }) {
  return (
    <div className="lp-password-wrapper">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      <button type="button" className="lp-eye-btn" onClick={onToggle} tabIndex={-1}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export default function LoginModal({ onLoginSuccess, initialRole = 'user' }) {
  const [view, setView] = useState('login');   // 'login' | 'signup' | 'forgot'
  const [role, setRole] = useState(initialRole);    // 'admin' | 'user'

  // Login fields
  const [loginId, setLoginId] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Signup fields
  const [signupId, setSignupId] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);

  // Forgot Password fields
  const [forgotId, setForgotId] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);

  // Status Check fields
  const [statusData, setStatusData] = useState(null);

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleIdInput = (e, setter) => {
    setter(e.target.value);
    if (/\D/.test(e.target.value)) {
      e.target.setCustomValidity("Please enter only numerical characters for the ID Number.");
      e.target.reportValidity();
    } else {
      e.target.setCustomValidity("");
    }
  };

  const switchRole = (r) => {
    setRole(r);
    setError(null);
    setSuccess(null);
    setStatusData(null);
    // If switching to admin, force login view (admins can't sign up)
    if (r === 'admin') setView('login');
  };
  const switchView = (v) => { setView(v); setError(null); setSuccess(null); setStatusData(null); };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const body = role === 'admin'
        ? { role: 'admin', id_number: loginId, password: loginPassword }
        : { role: 'user', email: loginEmail, password: loginPassword };

      const res = await apiPost('/api/auth/login/', body);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed.'); return; }
      saveTokens({ access: data.access, refresh: data.refresh });
      onLoginSuccess(data.username, data.is_staff, data.full_name);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError(null);
    if (signupPassword !== signupConfirm) { setError('Passwords do not match.'); return; }
    setIsLoading(true);
    try {
      const body = role === 'admin'
        ? { role: 'admin', id_number: signupId, name: signupName, email: signupEmail, password: signupPassword, confirm_password: signupConfirm }
        : { role: 'user', name: signupName, email: signupEmail, password: signupPassword, confirm_password: signupConfirm };

      const res = await apiPost('/api/auth/register/', body);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Sign up failed.'); return; }
      saveTokens({ access: data.access, refresh: data.refresh });
      onLoginSuccess(data.username, data.is_staff, data.full_name);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);
    try {
      const body = role === 'admin'
        ? { role: 'admin', id_number: forgotId, message: forgotMsg }
        : { role: 'user', email: forgotEmail, message: forgotMsg };

      const res = await apiPost('/api/auth/password-request/', body);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Request failed.'); return; }
      setSuccess(data.message || 'Request submitted successfully.');
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckStatus = async (e) => {
    e.preventDefault();
    setError(null);
    setStatusData(null);
    setIsLoading(true);
    try {
      const body = role === 'admin'
        ? { role: 'admin', id_number: forgotId }
        : { role: 'user', email: forgotEmail };

      const res = await apiPost('/api/auth/password-request-status/', body);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'No request found for this account.'); return; }
      setStatusData(data);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);
    try {
      const body = {
        role,
        new_password: newPassword,
        ...(role === 'admin' ? { id_number: forgotId } : { email: forgotEmail })
      };

      const res = await apiPost('/api/auth/password-reset-public/', body);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Reset failed.'); return; }

      setSuccess(data.message || 'Password reset successfully.');
      setStatusData(null); // Clear status view
      setView('login');    // Go back to login
      setNewPassword('');
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="lp-page">
      {/* Blurred background — place your photo at frontend/public/bg.jpg */}
      <div className="lp-bg" />

      <div className="lp-wrapper">
        <div className="lp-card">

          {/* Logo + Branding */}
          <div className="lp-brand" style={{ position: 'relative' }}>
            <img src={logo} alt="Municipality Logo" className="lp-logo-img" />
            <div>
              <div className="lp-brand-title">San Pascual, Batangas</div>
              <div className="lp-brand-sub">E-TAXMAP</div>
            </div>

            {/* Notification Bell for Public Status Check */}
            <div style={{ position: 'absolute', top: '0', right: '0' }}>
              <button
                type="button"
                onClick={() => switchView('status')}
                style={{
                  background: 'none', border: 'none', color: '#3b82f6',
                  cursor: 'pointer', padding: '8px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s', position: 'relative'
                }}
                title="Check Password Request Status"
              >
                <Bell size={20} />
                <span style={{
                  position: 'absolute', top: '5px', right: '5px',
                  width: '8px', height: '8px', background: '#ef4444',
                  borderRadius: '50%', border: '1px solid #0f1d35'
                }} />
              </button>
            </div>
          </div>

          {/* Page title */}
          <h1 className="lp-heading">
            {view === 'login' ? 'Login' :
              view === 'signup' ? 'Create a New Account' :
                view === 'forgot' ? 'Recover Password' : 'Check Request Status'}
          </h1>

          {/* Admin / User toggle */}
          <div className="lp-role-toggle">
            <button
              type="button"
              className={`lp-role-btn${role === 'admin' ? ' active' : ''}`}
              onClick={() => switchRole('admin')}
            >Admin</button>
            <button
              type="button"
              className={`lp-role-btn${role === 'user' ? ' active' : ''}`}
              onClick={() => switchRole('user')}
            >User</button>
          </div>

          {/* Error / Success banners */}
          {error && <div className="lp-error">{error}</div>}
          {success && <div className="lp-success" style={{ color: '#10b981', background: '#ecfdf5', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9em', border: '1px solid #d1fae5' }}>{success}</div>}

          {/* ── LOGIN FORM ── */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="lp-form">

              {role === 'admin' ? (
                <div className="lp-field">
                  <label>ID Number</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={loginId}
                    onChange={e => handleIdInput(e, setLoginId)}
                    placeholder="Enter your ID number"
                    required
                    autoFocus
                  />
                </div>
              ) : (
                <div className="lp-field">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="Enter your email address"
                    required
                    autoFocus
                  />
                </div>
              )}

              <div className="lp-field">
                <label>Password</label>
                <PasswordInput
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  show={showLoginPw}
                  onToggle={() => setShowLoginPw(v => !v)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-10px', marginBottom: '15px' }}>
                <button
                  type="button"
                  onClick={() => switchView('forgot')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '0.85em',
                    textDecoration: 'underline',
                    padding: 0,
                    fontWeight: '600'
                  }}
                >
                  Forgot Password?
                </button>
              </div>

              <button type="submit" className="lp-submit" disabled={isLoading}>
                {isLoading ? 'Signing in…' : 'Log-in'}
              </button>
            </form>
          )}

          {/* ── SIGNUP FORM ── */}
          {view === 'signup' && (
            <form onSubmit={handleSignup} className="lp-form">

              {role === 'admin' && (
                <div className="lp-field">
                  <label>ID Number</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={signupId}
                    onChange={e => handleIdInput(e, setSignupId)}
                    placeholder="Enter your ID number"
                    required
                    autoFocus
                  />
                </div>
              )}

              <div className="lp-field">
                <label>Full Name</label>
                <input
                  type="text"
                  value={signupName}
                  onChange={e => setSignupName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                  autoFocus={role === 'user'}
                />
              </div>

              <div className="lp-field">
                <label>Email Address</label>
                <input
                  type="email"
                  value={signupEmail}
                  onChange={e => setSignupEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                />
              </div>

              <div className="lp-field">
                <label>Password</label>
                <PasswordInput
                  value={signupPassword}
                  onChange={e => setSignupPassword(e.target.value)}
                  placeholder="Create a password"
                  show={showSignupPw}
                  onToggle={() => setShowSignupPw(v => !v)}
                  required
                />
              </div>

              <div className="lp-field">
                <label>Confirm Password</label>
                <PasswordInput
                  value={signupConfirm}
                  onChange={e => setSignupConfirm(e.target.value)}
                  placeholder="Confirm your password"
                  show={showSignupConfirm}
                  onToggle={() => setShowSignupConfirm(v => !v)}
                  required
                />
              </div>

              <button type="submit" className="lp-submit" disabled={isLoading} style={{ marginTop: '10px' }}>
                {isLoading ? 'Creating account…' : 'Sign Up'}
              </button>
            </form>
          )}

          {/* ── FORGOT PASSWORD FORM ── */}
          {view === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="lp-form">
              <p style={{ color: '#94a3b8', fontSize: '0.85em', marginBottom: '20px', lineHeight: '1.5' }}>
                {role === 'admin'
                  ? "Enter your ID Number. Another administrator will review your request and post a response."
                  : "Enter your registered email address. An administrator will review your request and provide assistance."}
              </p>

              {role === 'admin' ? (
                <div className="lp-field">
                  <label>ID Number</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={forgotId}
                    onChange={e => handleIdInput(e, setForgotId)}
                    placeholder="Enter your ID number"
                    required
                    autoFocus
                  />
                </div>
              ) : (
                <div className="lp-field">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="Enter your email address"
                    required
                    autoFocus
                  />
                </div>
              )}

              <div className="lp-field">
                <label>Message (Optional)</label>
                <textarea
                  value={forgotMsg}
                  onChange={e => setForgotMsg(e.target.value)}
                  placeholder="Explain your issue (e.g. I lost access to my email...)"
                  style={{ width: '100%', padding: '12px', background: '#0f1d35', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff', fontSize: '0.9em', minHeight: '80px', fontFamily: 'inherit', resize: 'none' }}
                />
              </div>

              <button type="submit" className="lp-submit" disabled={isLoading || success}>
                {isLoading ? 'Submitting…' : 'Submit Request'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <button type="button" onClick={() => switchView('status')} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82em', textDecoration: 'underline' }}>
                  Already submitted? Check your request status
                </button>
              </div>
            </form>
          )}

          {/* ── CHECK STATUS VIEW ── */}
          {view === 'status' && (
            <form onSubmit={handleCheckStatus} className="lp-form">
              <p style={{ color: '#94a3b8', fontSize: '0.85em', marginBottom: '20px', lineHeight: '1.5' }}>
                Enter your details to check if an administrator has responded to your request.
              </p>

              {role === 'admin' ? (
                <div className="lp-field">
                  <label>ID Number</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={forgotId}
                    onChange={e => handleIdInput(e, setForgotId)}
                    placeholder="Enter your ID number"
                    required
                    autoFocus
                  />
                </div>
              ) : (
                <div className="lp-field">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="Enter your email address"
                    required
                    autoFocus
                  />
                </div>
              )}

              <button type="submit" className="lp-submit" disabled={isLoading}>
                {isLoading ? 'Checking…' : 'Check Status'}
              </button>

              {statusData && (
                <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', borderRadius: '10px', position: 'relative' }}>
                  <button
                    onClick={() => setStatusData(null)}
                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    <X size={14} />
                  </button>
                  <div style={{ fontSize: '0.75em', color: '#3b82f6', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
                    Status: {statusData.status}
                  </div>
                  <div style={{ fontSize: '0.9em', color: '#fff', lineHeight: '1.4' }}>
                    {statusData.message}
                  </div>
                  <div style={{ fontSize: '0.7em', color: 'rgba(255,255,255,0.4)', marginTop: '10px' }}>
                    Last updated: {new Date(statusData.created_at).toLocaleString()}
                  </div>

                  {/* Show reset form if approved */}
                  {statusData.status === 'approved' && (
                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(59, 130, 246, 0.3)' }}>
                      <div className="lp-field">
                        <label>Set New Password</label>
                        <PasswordInput
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="Enter your new password"
                          show={showNewPw}
                          onToggle={() => setShowNewPw(!showNewPw)}
                          required
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        className="lp-submit"
                        style={{ marginTop: '10px' }}
                        disabled={isLoading}
                      >
                        {isLoading ? 'Resetting...' : 'Reset Password'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </form>
          )}

          {/* Switch between Login / Sign Up */}
          <p className="lp-switch">
            {(view === 'login' && role !== 'admin') ? (
              <>Don't have an account?{' '}
                <button type="button" onClick={() => switchView('signup')}>Sign up</button>
              </>
            ) : (view === 'login' && role === 'admin') ? (
              <span style={{ color: '#94a3b8', fontSize: '0.85em' }}>Administrator access only</span>
            ) : view === 'signup' ? (
              <>Already have an account?{' '}
                <button type="button" onClick={() => switchView('login')}>Log in</button>
              </>
            ) : (
              <button type="button" onClick={() => switchView('login')}>Back to login</button>
            )}
          </p>

        </div>
      </div>
    </div>
  );
}
