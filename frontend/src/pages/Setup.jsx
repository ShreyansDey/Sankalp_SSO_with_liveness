import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';

export default function Setup() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Step 1 fields: Primary Key Configuration
  const [primaryKeyInput, setPrimaryKeyInput] = useState('');
  const [bootUserInput, setBootUserInput] = useState('');
  const [bootPassInput, setBootPassInput] = useState('');
  const [apiKeyName, setApiKeyName] = useState('Primary Production Integration Key');
  const [mintedKey, setMintedKey] = useState('');

  // Step 2 fields: First Superuser Bootstrap
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [bootstrapPrimaryKey, setBootstrapPrimaryKey] = useState('');
  const [bootstrapUsername, setBootstrapUsername] = useState('');
  const [bootstrapPassword, setBootstrapPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/v1/setup/status');
      setStatus(data);
    } catch (err) {
      setError(err.message || 'Could not inspect bootstrap state.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConfigurePrimaryKey = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      const res = await apiRequest('/api/v1/setup/configure-primary-key', {
        method: 'POST',
        body: JSON.stringify({
          primary_key: primaryKeyInput,
          bootstrap_username: bootUserInput.trim() || null,
          bootstrap_password: bootPassInput || null,
          issue_api_key: true,
          api_key_name: apiKeyName.trim() || 'Initial Integration Key',
          scopes: ['*'],
        }),
      });
      if (res.api_key) setMintedKey(res.api_key);
      setBootstrapPrimaryKey(primaryKeyInput);
      if (bootUserInput) setBootstrapUsername(bootUserInput);
      if (bootPassInput) setBootstrapPassword(bootPassInput);
      setSuccessMsg('First-Time Superuser Creation Primary Key & API Key configured. Complete Step 2 below.');
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrapSuperuser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      const res = await apiRequest('/api/v1/setup/bootstrap-superuser', {
        method: 'POST',
        body: JSON.stringify({
          primary_key: bootstrapPrimaryKey,
          bootstrap_username: bootstrapUsername.trim() || null,
          bootstrap_password: bootstrapPassword || null,
          name: adminName,
          email: adminEmail,
          password: adminPassword,
          issue_api_key: !mintedKey,
          api_key_name: 'Superuser Console Key',
        }),
      });
      if (res.api_key) {
        setMintedKey(res.api_key);
      }
      if (res.login_ticket) {
        sessionStorage.setItem('sankalp_liveness_ticket', res.login_ticket);
      }
      navigate('/liveness', {
        state: {
          userId: res.user_id,
          email: res.email,
          loginTicket: res.login_ticket,
          next: '/admin',
          mintedApiKey: res.api_key || mintedKey,
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F3EFE7', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', background: '#FFF', border: '1px solid #DDD6C7', borderRadius: 14, padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24, color: '#12171E' }}>Sankalp SSO — First-Time Superuser Setup</h1>
          <Link to="/login" style={{ fontSize: 13, color: '#2B5B84' }}>Back to Login</Link>
        </div>

        {loading && <p>Checking appliance initialization status...</p>}

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}
        {successMsg && (
          <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {successMsg}
          </div>
        )}

        {mintedKey && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: 14, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#92400E', marginBottom: 4 }}>
              Save Your Universal Integration API Key (Shown Once)
            </div>
            <code style={{ display: 'block', wordBreak: 'break-all', fontSize: 12, background: '#FFF', padding: 8, borderRadius: 6, border: '1px solid #F3E8C8' }}>
              {mintedKey}
            </code>
          </div>
        )}

        {!loading && status?.setup_completed && (
          <div style={{ padding: 20, background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
            <h3 style={{ marginTop: 0 }}>Bootstrap Permanently Locked</h3>
            <p style={{ fontSize: 14, color: '#475569' }}>
              A Super Administrator account already exists on this instance. First-time bootstrap is permanently disabled for security.
            </p>
            <Link to="/login" style={{ display: 'inline-block', padding: '10px 18px', background: '#12171E', color: '#FFF', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>
              Sign In to SSO
            </Link>
          </div>
        )}

        {!loading && status?.needs_bootstrap && !status?.primary_key_configured && (
          <form onSubmit={handleConfigurePrimaryKey}>
            <h3 style={{ marginTop: 0, color: '#12171E' }}>Step 1: Set Your First-Time Superuser Creation Primary Key</h3>
            <p style={{ fontSize: 13, color: '#5A6270' }}>
              Define your secret primary key (and optional bootstrap username/password) required before creating the first Super Admin account, and mint your initial API key.
            </p>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Your Superuser Creation Primary Key (min 12 chars) *
            </label>
            <input
              type="password"
              required
              minLength={12}
              value={primaryKeyInput}
              onChange={(e) => setPrimaryKeyInput(e.target.value)}
              placeholder="Enter custom strong primary key..."
              style={{ width: '100%', padding: 10, marginBottom: 12, borderRadius: 8, border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Optional Bootstrap Username</label>
                <input
                  type="text"
                  value={bootUserInput}
                  onChange={(e) => setBootUserInput(e.target.value)}
                  placeholder="e.g., setup-owner"
                  style={{ width: '100%', padding: 9, borderRadius: 8, border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Optional Bootstrap Password</label>
                <input
                  type="password"
                  value={bootPassInput}
                  onChange={(e) => setBootPassInput(e.target.value)}
                  placeholder="Min 8 chars if username set"
                  style={{ width: '100%', padding: 9, borderRadius: 8, border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Initial API Key Label</label>
            <input
              type="text"
              value={apiKeyName}
              onChange={(e) => setApiKeyName(e.target.value)}
              style={{ width: '100%', padding: 9, marginBottom: 16, borderRadius: 8, border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
            />
            <button type="submit" disabled={submitting} style={{ width: '100%', padding: 12, background: '#12171E', color: '#FFF', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
              {submitting ? 'Configuring...' : 'Configure Primary Key & Generate API Key'}
            </button>
          </form>
        )}

        {!loading && status?.needs_bootstrap && status?.primary_key_configured && (
          <form onSubmit={handleBootstrapSuperuser}>
            <h3 style={{ marginTop: 0, color: '#12171E' }}>Step 2: Create First Super Admin Credential</h3>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Superuser Creation Primary Key *</label>
            <input
              type="password"
              required
              value={bootstrapPrimaryKey}
              onChange={(e) => setBootstrapPrimaryKey(e.target.value)}
              placeholder="Enter your configured primary key"
              style={{ width: '100%', padding: 10, marginBottom: 12, borderRadius: 8, border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
            />
            {status.requires_bootstrap_credentials && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <input
                  type="text"
                  required
                  value={bootstrapUsername}
                  onChange={(e) => setBootstrapUsername(e.target.value)}
                  placeholder="Bootstrap Username *"
                  style={{ padding: 10, borderRadius: 8, border: '1px solid #CBD5E1' }}
                />
                <input
                  type="password"
                  required
                  value={bootstrapPassword}
                  onChange={(e) => setBootstrapPassword(e.target.value)}
                  placeholder="Bootstrap Password *"
                  style={{ padding: 10, borderRadius: 8, border: '1px solid #CBD5E1' }}
                />
              </div>
            )}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Super Admin Full Name *</label>
            <input
              type="text"
              required
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="e.g., Campus Security Lead"
              style={{ width: '100%', padding: 10, marginBottom: 12, borderRadius: 8, border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
            />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Super Admin Email *</label>
            <input
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@yourdomain.org"
              style={{ width: '100%', padding: 10, marginBottom: 12, borderRadius: 8, border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
            />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Super Admin Password (min 8 chars) *</label>
            <input
              type="password"
              required
              minLength={8}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              style={{ width: '100%', padding: 10, marginBottom: 16, borderRadius: 8, border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
            />
            <button type="submit" disabled={submitting} style={{ width: '100%', padding: 12, background: '#12171E', color: '#FFF', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
              {submitting ? 'Bootstrapping...' : 'Create Super Admin & Proceed to Liveness'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
