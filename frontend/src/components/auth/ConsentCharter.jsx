import React from 'react';

export function ConsentCharter({ accepted, onChange, compact = false }) {
  return (
    <div style={{
      border: '1px solid var(--border, #DDD6C7)',
      borderRadius: 10,
      padding: compact ? '12px 14px' : '16px 18px',
      background: '#FBF9F4',
      marginTop: 12,
      marginBottom: 14,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#12171E', marginBottom: 6 }}>
        DPDP Act 2023 Informed Privacy Charter
      </div>
      <ul style={{ margin: '0 0 10px 18px', padding: 0, fontSize: 12, color: '#4A5568', lineHeight: 1.55 }}>
        <li><strong>Zero Video Storage:</strong> Webcam liveness runs locally in your browser; raw video is never saved.</li>
        <li><strong>Document Reduction:</strong> Uploaded ID documents & raw photos are permanently erased immediately on approval or rejection.</li>
        <li><strong>128D Vector Only:</strong> Only a non-reversible mathematical facial signature is stored when face lock applies.</li>
        <li><strong>48-Hour Purge Guarantee:</strong> Offboarded accounts are completely purged with a final data takeout notice.</li>
      </ul>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onChange(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          I explicitly consent to this minimal identity verification and automatic lifecycle policy.
        </span>
      </label>
    </div>
  );
}
