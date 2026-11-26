'use client';
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  DEFAULT_PCCI_CONFIG,
  isDefaultPcciConfig,
  type AlphaCompositingMode,
  type KSelectionDiagnostics,
  type KSelectionMode,
  type PcciConfig,
} from '@/lib/pcci';
import styles from './dashboard.module.css';

function KCurveChart({ diagnostics }: { diagnostics: KSelectionDiagnostics }) {
  const pts = diagnostics.candidates;
  if (pts.length < 2) return null;

  const isElbow = diagnostics.mode === 'elbow';
  const w = 320;
  const h = 112;
  const padL = 28;
  const padR = 12;
  const padT = 14;
  const padB = 22;

  const minK = pts[0].k;
  const maxK = pts[pts.length - 1].k;
  const values = pts.map((p) => (isElbow ? p.inertia : p.silhouette));
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const spanV = maxV - minV || 1;
  const spanK = maxK - minK || 1;

  const xOf = (k: number) => padL + ((k - minK) / spanK) * (w - padL - padR);
  const yOf = (v: number) => padT + (1 - (v - minV) / spanV) * (h - padT - padB);

  const polyline = pts.map((p, i) => `${xOf(p.k).toFixed(1)},${yOf(values[i]).toFixed(1)}`).join(' ');
  const chosenIdx = pts.findIndex((p) => p.k === diagnostics.selectedK);
  const chosenX = chosenIdx >= 0 ? xOf(pts[chosenIdx].k) : null;
  const chosenY = chosenIdx >= 0 ? yOf(values[chosenIdx]) : null;

  return (
    <div className={styles.clusterDetailCard}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <strong>{isElbow ? 'Elbow inertia curve (CIELAB SSE)' : 'Mean Silhouette curve'}</strong>
        <span style={{ color: 'var(--blue)', fontWeight: 700 }}>K* = {diagnostics.selectedK}</span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={diagnostics.rationale}
      >
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#cfd7e3" strokeWidth="1" />
        <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#cfd7e3" strokeWidth="1" />
        {isElbow && (
          <line
            x1={xOf(pts[0].k)}
            y1={yOf(values[0])}
            x2={xOf(pts[pts.length - 1].k)}
            y2={yOf(values[values.length - 1])}
            stroke="#b7c4d8"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        <polyline fill="none" stroke="#005de8" strokeWidth="2" points={polyline} />
        {pts.map((p, i) => (
          <circle
            key={p.k}
            cx={xOf(p.k)}
            cy={yOf(values[i])}
            r={p.k === diagnostics.selectedK ? 4.5 : 2.5}
            fill={p.k === diagnostics.selectedK ? '#c20c6a' : '#005de8'}
            stroke={p.k === diagnostics.selectedK ? '#ffffff' : 'none'}
            strokeWidth="1.5"
          />
        ))}
        {chosenX !== null && chosenY !== null && (
          <text
            x={Math.min(w - 26, Math.max(padL + 12, chosenX))}
            y={Math.max(11, chosenY - 7)}
            fontSize="10"
            fontWeight="bold"
            fill="#c20c6a"
            textAnchor="middle"
          >
            K={diagnostics.selectedK}
          </text>
        )}
        <text x={padL} y={h - 6} fontSize="9.5" fill="#4b5c77">
          {minK}
        </text>
        <text x={w - padR} y={h - 6} fontSize="9.5" fill="#4b5c77" textAnchor="end">
          {maxK}
        </text>
        <text x={(padL + w - padR) / 2} y={h - 6} fontSize="9.5" fill="#4b5c77" textAnchor="middle">
          Candidate K
        </text>
      </svg>
      <p className="note" style={{ margin: '4px 0 0', fontSize: 10.5 }}>
        {diagnostics.rationale}
      </p>
    </div>
  );
}

export function ResearchParamsPanel({
  config,
  kSelection,
  busy,
  onApply,
}: {
  config: PcciConfig;
  kSelection?: KSelectionDiagnostics;
  busy: boolean;
  onApply: (next: PcciConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PcciConfig>({ ...config });
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    setDraft({ ...config });
  }, [config]);

  const isDefault = isDefaultPcciConfig(config);

  function validateAndApply(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');

    const minK = draft.kSelectionMode === 'fixed' ? 2 : 4;
    if (!Number.isInteger(draft.k) || draft.k < minK || draft.k > 48) {
      setValidationError(
        `Number of clusters K must be an integer between ${minK} and 48.`,
      );
      return;
    }
    if (!Number.isFinite(draft.tau) || draft.tau < 2 || draft.tau > 40) {
      setValidationError('Tau must be between 2 and 40.');
      return;
    }
    if (
      !Number.isFinite(draft.minOriginalDeltaE) ||
      draft.minOriginalDeltaE < 0 ||
      draft.minOriginalDeltaE > 40
    ) {
      setValidationError('Minimum original CIEDE2000 distance must be between 0 and 40.');
      return;
    }
    if (
      !Number.isFinite(draft.minClusterFrequency) ||
      draft.minClusterFrequency < 0.001 ||
      draft.minClusterFrequency > 0.1
    ) {
      setValidationError('Minimum colour frequency must be between 0.001 (0.1%) and 0.10 (10%).');
      return;
    }
    if (
      !Number.isFinite(draft.globalWeight) ||
      draft.globalWeight < 0 ||
      draft.globalWeight > 1
    ) {
      setValidationError('Global weight must be between 0 and 1.');
      return;
    }
    if (
      !Number.isFinite(draft.tailProportion) ||
      draft.tailProportion < 0.01 ||
      draft.tailProportion > 1
    ) {
      setValidationError('Upper-tail proportion q must be between 0.01 (1%) and 1.00 (100%).');
      return;
    }

    void onApply({ ...draft });
  }

  return (
    <form className={styles.paramStack} onSubmit={validateAndApply}>
      <div className={styles.inspectorSubHeader}>
        <h2>Experimental Research Mode</h2>
      </div>
      <p className="note" style={{ margin: 0, fontSize: 11.5 }}>
        Adjust clustering and PCCI parameters live alongside the viewer. Active settings are
        recorded in every export.
      </p>

      <div className={styles.paramField}>
        <label htmlFor="param-kmode">Cluster count K selection</label>
        <select
          id="param-kmode"
          value={draft.kSelectionMode}
          onChange={(e) =>
            setDraft({ ...draft, kSelectionMode: e.target.value as KSelectionMode })
          }
        >
          <option value="fixed">Fixed K (Python reference default: K = 24)</option>
          <option value="elbow">Auto — Elbow point (Kneedle CIELAB SSE)</option>
          <option value="silhouette">Auto — Max Silhouette score (CIELAB)</option>
        </select>
        <small>
          {draft.kSelectionMode === 'fixed'
            ? 'Preserves small diagram accents and matches the Python reference benchmark.'
            : draft.kSelectionMode === 'elbow'
              ? 'Finds a compact K via maximum curvature on the CIELAB inertia curve (may merge subtle accents in dense infographics).'
              : 'Maximizes cluster separation; note that uniform white/black backgrounds can cause Silhouette to pick K = 2.'}
        </small>
      </div>

      {kSelection && <KCurveChart diagnostics={kSelection} />}

      <div className={styles.paramField}>
        <label htmlFor="param-k">
          {draft.kSelectionMode === 'fixed' ? 'Clusters K (2–48)' : 'Max candidate K (4–48)'}
        </label>
        <input
          id="param-k"
          type="number"
          min={draft.kSelectionMode === 'fixed' ? 2 : 4}
          max={48}
          step={1}
          value={draft.k}
          onChange={(e) => setDraft({ ...draft, k: Math.round(Number(e.target.value)) })}
        />
        <small>
          {draft.kSelectionMode === 'fixed'
            ? 'Default: 24 (re-runs MiniBatch K-means)'
            : 'Upper bound for Elbow / Silhouette search (default: 24)'}
        </small>
      </div>

      <div className={styles.paramField}>
        <label htmlFor="param-tau">Remaining-distance scale τ (2–40)</label>
        <input
          id="param-tau"
          type="number"
          min={2}
          max={40}
          step={0.5}
          value={draft.tau}
          onChange={(e) => setDraft({ ...draft, tau: Number(e.target.value) })}
        />
        <small>Default: 12 CIEDE2000 units</small>
      </div>

      <div className={styles.paramField}>
        <label htmlFor="param-minde">Min original ΔE₀₀ (0–40)</label>
        <input
          id="param-minde"
          type="number"
          min={0}
          max={40}
          step={0.5}
          value={draft.minOriginalDeltaE}
          onChange={(e) => setDraft({ ...draft, minOriginalDeltaE: Number(e.target.value) })}
        />
        <small>Default: 10</small>
      </div>

      <div className={styles.paramField}>
        <label htmlFor="param-minfreq">Min cluster frequency (0.001–0.10)</label>
        <input
          id="param-minfreq"
          type="number"
          min={0.001}
          max={0.1}
          step={0.001}
          value={draft.minClusterFrequency}
          onChange={(e) => setDraft({ ...draft, minClusterFrequency: Number(e.target.value) })}
        />
        <small>Default: 0.005 (0.5% of image pixels)</small>
      </div>

      <div className={styles.paramField}>
        <label htmlFor="param-gweight">
          Global vs Local mix ({Math.round(draft.globalWeight * 100)}% global /{' '}
          {Math.round((1 - draft.globalWeight) * 100)}% local)
        </label>
        <input
          id="param-gweight"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={draft.globalWeight}
          onChange={(e) => setDraft({ ...draft, globalWeight: Number(e.target.value) })}
        />
        <small>Default: 50% / 50%</small>
      </div>

      <div className={styles.paramField}>
        <label htmlFor="param-tail">Upper-tail proportion q (0.01–1.00)</label>
        <input
          id="param-tail"
          type="number"
          min={0.01}
          max={1}
          step={0.01}
          value={draft.tailProportion}
          onChange={(e) => setDraft({ ...draft, tailProportion: Number(e.target.value) })}
        />
        <small>Default: 0.10 (top 10% cumulative weight)</small>
      </div>

      <div className={styles.paramField}>
        <label htmlFor="param-alpha">Transparent pixel compositing</label>
        <select
          id="param-alpha"
          value={draft.alphaCompositing}
          onChange={(e) =>
            setDraft({ ...draft, alphaCompositing: e.target.value as AlphaCompositingMode })
          }
        >
          <option value="black">Black (Python reference default)</option>
          <option value="white">White page (experimental)</option>
        </select>
      </div>

      {validationError && (
        <p className="errorMessage" role="alert" style={{ margin: 0 }}>
          {validationError}
        </p>
      )}

      <div className={styles.paramActions}>
        <button
          type="submit"
          className="button primary"
          style={{ minHeight: 36, fontSize: 12.5, flex: 1 }}
          disabled={busy}
        >
          Apply &amp; recalculate
        </button>
        <button
          type="button"
          className="button"
          style={{ minHeight: 36, fontSize: 12.5 }}
          disabled={busy || isDefault}
          onClick={() => {
            setValidationError('');
            setDraft({ ...DEFAULT_PCCI_CONFIG });
            void onApply({ ...DEFAULT_PCCI_CONFIG });
          }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Reset
        </button>
      </div>
    </form>
  );
}
