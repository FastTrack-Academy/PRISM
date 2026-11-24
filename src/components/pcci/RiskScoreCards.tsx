'use client';
import { AlertOctagon, AlertTriangle, Info, ShieldCheck } from 'lucide-react';
import {
  CVD_TYPES,
  getProvisionalRiskBand,
  type CvdType,
  type PcciAnalysisResult,
  type RiskBand,
} from '@/lib/pcci';
import styles from './dashboard.module.css';

function BandIcon({ level }: { level: RiskBand['level'] }) {
  if (level === 'low') return <ShieldCheck size={14} aria-hidden="true" />;
  if (level === 'moderate') return <Info size={14} aria-hidden="true" />;
  if (level === 'elevated') return <AlertTriangle size={14} aria-hidden="true" />;
  return <AlertOctagon size={14} aria-hidden="true" />;
}

const BAR_CLASS: Record<RiskBand['level'], string> = {
  low: styles.barLow,
  moderate: styles.barModerate,
  elevated: styles.barElevated,
  high: styles.barHigh,
};

const BADGE_CLASS: Record<RiskBand['level'], string> = {
  low: styles.bandLow,
  moderate: styles.bandModerate,
  elevated: styles.bandElevated,
  high: styles.bandHigh,
};

export function RiskScoreCards({
  result,
  selectedCvd,
  onSelectCvd,
}: {
  result: PcciAnalysisResult;
  selectedCvd: CvdType;
  onSelectCvd: (cvd: CvdType) => void;
}) {
  return (
    <section className={styles.cardsSection} aria-labelledby="pcci-scores-heading">
      <div className={styles.sectionTop}>
        <h2 id="pcci-scores-heading">Perceptual Color Confusion Index (PCCI)</h2>
        <p className={styles.sectionHint}>
          Three independent 0–100 risk scores (higher = greater estimated confusion risk). Risk bands
          are experimental research defaults, not clinically calibrated thresholds.
        </p>
      </div>
      <div className={styles.scoreGrid} role="group" aria-label="Independent CVD risk scores">
        {CVD_TYPES.map((cvdType) => {
          const data = result.cvd[cvdType];
          const band = getProvisionalRiskBand(data.pcciScore, result.status);
          const active = selectedCvd === cvdType;
          const pct = Math.min(100, Math.max(0, data.pcciScore));

          return (
            <button
              key={cvdType}
              type="button"
              className={`${styles.scoreCard} ${active ? styles.scoreCardSelected : ''}`}
              aria-pressed={active}
              onClick={() => onSelectCvd(cvdType)}
            >
              <div className={styles.scoreCardHead}>
                <span className={styles.scoreCardTitle}>{cvdType}</span>
                {active && <span className={styles.activePill}>Inspecting</span>}
              </div>

              <div className={styles.scoreNumberRow}>
                <strong className={styles.scoreBig}>{data.pcciScore.toFixed(1)}</strong>
                <span className={styles.scoreDenom}>/ 100</span>
              </div>

              <div
                className={styles.riskBarTrack}
                role="progressbar"
                aria-label={`${cvdType} PCCI risk score`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Number(data.pcciScore.toFixed(1))}
              >
                <div
                  className={`${styles.riskBarFill} ${BAR_CLASS[band.level]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className={styles.bandRow}>
                <span className={`${styles.bandBadge} ${BADGE_CLASS[band.level]}`}>
                  <BandIcon level={band.level} />
                  {band.label}
                </span>
                <span className={styles.bandRange}>Default band: {band.range}</span>
              </div>

              <div className={styles.cardSubStats}>
                <div>
                  <span>Weighted mean risk</span>
                  <strong>{data.meanRisk.toFixed(1)} / 100</strong>
                </div>
                <div>
                  <span>High-risk pair-weight share</span>
                  <strong>{data.highRiskPairWeightShare.toFixed(1)}%</strong>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
