import React, { useEffect, useState } from 'react';
import { API_BASE, apiRequest } from '../../api';

export default function AdminIntegrationsTab() {
  const [keys, setKeys] = useState([]);
  const [apps, setApps] = useState([]);
  const [reports, setReports] = useState([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [mintedKey, setMintedKey] = useState('');
  const [appName, setAppName] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [mintedSecret, setMintedSecret] = useState(null);
  const [error, setError] = useState('');

  const loadAll = async () => {
    setError('');
    try {
      const [k, a, r] = await Promise.all([
        apiRequest('/api/v1/keys'),
        apiRequest('/api/v1/integrations/apps'),
        apiRequest('/api/v1/reports'),
      ]);
      setKeys(k || []);
      setApps(a || []);
      setReports(r?.reports || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateKey = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiRequest('/api/v1/keys', {
        method: 'POST',
        body: JSON.stringify({
          name: newKeyName || 'External Integration Key',
          scopes: ['sso:read', 'sso:write', 'apps:manage'],
        }),
      });
      setMintedKey(res.api_key);
      setNewKeyName('');
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevokeKey = async (id) => {
    try {
      await apiRequest(`/api/v1/keys/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateApp = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiRequest('/api/v1/integrations/apps', {
        method: 'POST',
        body: JSON.stringify({ name: appName, redirect_uri: redirectUri }),
      });
      setMintedSecret(res);
      setAppName('');
      setRedirectUri('');
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRotateSecret = async (id) => {
    try {
      const res = await apiRequest(`/api/v1/integrations/apps/${id}/rotate-secret`, { method: 'POST' });
      setMintedSecret(res);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: 12, borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div className="panel" style={{ background: '#FFF', border: '1px solid #DDD6C7', borderRadius: 12, padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>Universal SSO Integration API Keys</h3>
        <form onSubmit={handleCreateKey} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Integration Key Label (e.g. Campus ERP Sync)"
            required
            style={{ flex: 1, padding: 9, borderRadius: 8, border: '1px solid #CBD5E1' }}
          />
          <button type="submit" className="btn-primary">Generate API Key</button>
        </form>
        {mintedKey && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: 12, borderRadius: 8, marginBottom: 14 }}>
            <strong>Save API Key (shown once):</strong> <code style={{ wordBreak: 'break-all' }}>{mintedKey}</code>
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Last Used</th><th>Action</th></tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td><code>{k.key_prefix}...</code></td>
                  <td>{(k.scopes || []).join(', ')}</td>
                  <td>{k.revoked_at ? 'Revoked' : (k.last_used_at || 'Never')}</td>
                  <td>
                    {!k.revoked_at && (
                      <button className="btn-danger-sm" onClick={() => handleRevokeKey(k.id)}>Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ background: '#FFF', border: '1px solid #DDD6C7', borderRadius: 12, padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>OIDC / OAuth2 Connected Apps</h3>
        <form onSubmit={handleCreateApp} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <input type="text" required value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="App Name" style={{ flex: 1, minWidth: 180, padding: 9, borderRadius: 8, border: '1px solid #CBD5E1' }} />
          <input type="url" required value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} placeholder="Exact Redirect URI (https://...)" style={{ flex: 2, minWidth: 240, padding: 9, borderRadius: 8, border: '1px solid #CBD5E1' }} />
          <button type="submit" className="btn-primary">Register App</button>
        </form>
        {mintedSecret && (
          <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
            <div><strong>Client ID:</strong> <code>{mintedSecret.client_id}</code></div>
            <div><strong>Client Secret (shown once):</strong> <code style={{ wordBreak: 'break-all' }}>{mintedSecret.client_secret}</code></div>
          </div>
        )}
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr><th>App Name</th><th>Client ID</th><th>Redirect URI</th><th>Action</th></tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td><code>{a.client_id}</code></td>
                <td><code>{a.redirect_uri}</code></td>
                <td><button className="btn-secondary-sm" onClick={() => handleRotateSecret(a.id)}>Rotate Secret</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ background: '#FFF', border: '1px solid #DDD6C7', borderRadius: 12, padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>Downloadable Immutable Security & Stress Reports</h3>
        {reports.length === 0 ? (
          <p style={{ color: '#64748B', fontSize: 13 }}>Reports will appear here once generated.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {reports.map((rep) => (
              <li key={rep.filename} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div>
                  <strong>{rep.filename}</strong>
                  <div style={{ fontSize: 11, color: '#64748B' }}>SHA-256: <code>{rep.sha256.slice(0, 20)}...</code> ({rep.size_bytes} bytes)</div>
                </div>
                <a href={`${API_BASE}${rep.download_url}`} download={rep.filename} className="btn-secondary-sm" style={{ textDecoration: 'none' }}>
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
