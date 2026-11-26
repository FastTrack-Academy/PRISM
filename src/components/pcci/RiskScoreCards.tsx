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
  if (level === 'low') return <ShieldCheck size={12} aria-hidden="true" />;
  if (level === 'moderate') return <Info size={12} aria-hidden="true" />;
  if (level === 'elevated') return <AlertTriangle size={12} aria-hidden="true" />;
  return <AlertOctagon size={12} aria-hidden="true" />;
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
    <section className={styles.cvdStrip} aria-labelledby="pcci-scores-heading">
      <div className={styles.cvdStripHead}>
        <h1 id="pcci-scores-heading">
          Perceptual Color Confusion Index (PCCI)
          <span className="note" style={{ fontWeight: 400 }}>
            · {result.clusterCount} clusters
            {result.kSelection
              ? ` (${result.kSelection.mode === 'elbow' ? 'Auto Elbow' : 'Auto Silhouette'})`
              : ''}{' '}
            · {result.eligiblePairCount} eligible pairs · {result.processingTimeMs.toFixed(0)} ms
          </span>
        </h1>
        <p className={styles.cvdStripHint}>
          Click a CVD card to switch both the simulation and its confusing colour pairs below (0–100,
          higher = greater risk; bands are experimental defaults).
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
              <div className={styles.scoreCardTop}>
                <span className={styles.scoreCardTitle}>{cvdType}</span>
                {active ? (
                  <span className={styles.activePill}>Viewing</span>
                ) : (
                  <span className="note" style={{ fontSize: 11 }}>
                    Click to inspect
                  </span>
                )}
              </div>

              <div className={styles.scoreMetricLine}>
                <div className={styles.scoreNumberRow}>
                  <strong className={styles.scoreBig}>{data.pcciScore.toFixed(1)}</strong>
                  <span className={styles.scoreDenom}>/ 100</span>
                </div>
                <span className={`${styles.bandBadge} ${BADGE_CLASS[band.level]}`}>
                  <BandIcon level={band.level} />
                  {band.label}
                </span>
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

              <div className={styles.cardMicroStats}>
                <span>
                  Mean risk: <strong>{data.meanRisk.toFixed(1)}</strong>
                </span>
                <span>
                  High-risk pair weight: <strong>{data.highRiskPairWeightShare.toFixed(1)}%</strong>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
