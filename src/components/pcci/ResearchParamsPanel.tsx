'use client';
import { useEffect, useState } from 'react';
import { FlaskConical, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  DEFAULT_PCCI_CONFIG,
  isDefaultPcciConfig,
  type AlphaCompositingMode,
  type PcciConfig,
} from '@/lib/pcci';
import styles from './dashboard.module.css';

export function ResearchParamsPanel({
  config,
  busy,
  onApply,
}: {
  config: PcciConfig;
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

    if (!Number.isInteger(draft.k) || draft.k < 2 || draft.k > 48) {
      setValidationError('Number of clusters K must be an integer between 2 and 48.');
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
    <details className={styles.researchDetails}>
      <summary className={styles.researchSummary}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <FlaskConical size={16} aria-hidden="true" />
          Experimental Research Mode — Algorithm Parameters
          {!isDefault && (
            <span className={styles.activePill} style={{ background: '#fef5e6', color: '#7c4200' }}>
              Non-default active
            </span>
          )}
        </span>
        <SlidersHorizontal size={15} aria-hidden="true" />
      </summary>

      <form className={styles.researchForm} onSubmit={validateAndApply}>
        <p className="note" style={{ margin: '10px 0 0' }}>
          Modify PCCI parameters to run sensitivity experiments. Changes trigger a real
          recalculation and are recorded in all exported CSV, JSON, and PDF files.
        </p>

        <div className={styles.paramGrid}>
          <div className={styles.paramField}>
            <label htmlFor="param-k">Clusters K (2–48)</label>
            <input
              id="param-k"
              type="number"
              min={2}
              max={48}
              step={1}
              value={draft.k}
              onChange={(e) => setDraft({ ...draft, k: Math.round(Number(e.target.value)) })}
            />
            <small>Default: 24 (re-runs MiniBatch K-means)</small>
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
            <small>Default: 0.005 (0.5% of pixels)</small>
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
            <small>Default: 50% global / 50% local</small>
          </div>

          <div className={styles.paramField}>
            <label htmlFor="param-tail">Upper-tail weight proportion q (0.01–1.00)</label>
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
            <small>Applies to transparent PNG inputs</small>
          </div>
        </div>

        {validationError && (
          <p className="errorMessage" role="alert" style={{ margin: 0 }}>
            {validationError}
          </p>
        )}

        <div className={styles.paramActions}>
          <button type="submit" className="button primary" disabled={busy}>
            Apply &amp; recalculate
          </button>
          <button
            type="button"
            className="button"
            disabled={busy || isDefault}
            onClick={() => {
              setValidationError('');
              setDraft({ ...DEFAULT_PCCI_CONFIG });
              void onApply({ ...DEFAULT_PCCI_CONFIG });
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />
            Reset to defaults
          </button>
        </div>
      </form>
    </details>
  );
}
