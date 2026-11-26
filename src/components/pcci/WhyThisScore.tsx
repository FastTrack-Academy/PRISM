'use client';
import { useMemo, useState } from 'react';
import { ArrowRight, Layers } from 'lucide-react';
import type { CvdType, PcciAnalysisResult, PcciColorPair } from '@/lib/pcci';
import styles from './dashboard.module.css';

type SortKey = 'pairwiseRisk' | 'combinedWeight' | 'weightedContribution';

export function WhyThisScore({
  result,
  selectedCvd,
  selectedPair,
  onSelectPair,
}: {
  result: PcciAnalysisResult;
  selectedCvd: CvdType;
  selectedPair: PcciColorPair | null;
  onSelectPair: (pair: PcciColorPair) => void;
}) {
  const [sortBy, setSortBy] = useState<SortKey>('pairwiseRisk');
  const [showAll, setShowAll] = useState(false);

  const cvdData = result.cvd[selectedCvd];

  const sortedPairs = useMemo(() => {
    const list = [...cvdData.pairs];
    list.sort((a, b) => {
      if (sortBy === 'combinedWeight') {
        return b.combinedWeight - a.combinedWeight || b.pairwiseRisk - a.pairwiseRisk;
      }
      if (sortBy === 'weightedContribution') {
        return b.weightedContribution - a.weightedContribution || b.pairwiseRisk - a.pairwiseRisk;
      }
      return b.pairwiseRisk - a.pairwiseRisk || b.combinedWeight - a.combinedWeight;
    });
    return list;
  }, [cvdData.pairs, sortBy]);

  const visiblePairs = showAll ? sortedPairs : sortedPairs.slice(0, 15);

  return (
    <>
      <div className={styles.inspectorSubHeader}>
        <h2 id="why-score-heading">Why this score? · {selectedCvd}</h2>
        <div className={styles.sortPills} role="group" aria-label="Sort colour pairs">
          <button
            type="button"
            aria-pressed={sortBy === 'pairwiseRisk'}
            onClick={() => setSortBy('pairwiseRisk')}
          >
            Risk
          </button>
          <button
            type="button"
            aria-pressed={sortBy === 'combinedWeight'}
            onClick={() => setSortBy('combinedWeight')}
          >
            Weight
          </button>
          <button
            type="button"
            aria-pressed={sortBy === 'weightedContribution'}
            onClick={() => setSortBy('weightedContribution')}
          >
            Impact
          </button>
        </div>
      </div>

      <p className="note" style={{ margin: 0, fontSize: 11.5 }}>
        Image PCCI (<strong>{cvdData.pcciScore.toFixed(1)}</strong>) averages pairwise risk across
        the top <strong>{(result.config.tailProportion * 100).toFixed(0)}%</strong> of cumulative
        eligible pair weight. Click any pair below to highlight it live on the image.
      </p>

      {sortedPairs.length === 0 ? (
        <div className={styles.statusNotice}>
          <span>
            No eligible pairs met ΔE₀₀ ≥ {result.config.minOriginalDeltaE} and area ≥{' '}
            {(result.config.minClusterFrequency * 100).toFixed(2)}%. Zero detected risk does not
            prove accessibility.
          </span>
        </div>
      ) : (
        <div className={styles.pairCardList}>
          {visiblePairs.map((pair) => {
            const isSelected =
              selectedPair?.clusterA === pair.clusterA &&
              selectedPair?.clusterB === pair.clusterB;
            return (
              <button
                key={`${pair.clusterA}-${pair.clusterB}`}
                type="button"
                className={`${styles.pairCard} ${isSelected ? styles.pairCardActive : ''}`}
                aria-pressed={isSelected}
                onClick={() => onSelectPair(pair)}
              >
                <div className={styles.pairCardTop}>
                  <div className={styles.pairTransform}>
                    <span className={styles.swatchDuo} title="Original colour pair">
                      <span style={{ backgroundColor: pair.originalHexA }} />
                      <span style={{ backgroundColor: pair.originalHexB }} />
                    </span>
                    <ArrowRight size={13} color="var(--muted)" aria-hidden="true" />
                    <span className={styles.swatchDuo} title={`${selectedCvd} simulated pair`}>
                      <span style={{ backgroundColor: pair.simulatedHexA }} />
                      <span style={{ backgroundColor: pair.simulatedHexB }} />
                    </span>
                  </div>

                  <div className={styles.pairRiskBadge}>
                    <span>{(pair.pairwiseRisk * 100).toFixed(1)}</span>
                    {pair.tailIncludedWeight > 0 && (
                      <span className={styles.tailTag}>
                        Top {(result.config.tailProportion * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.pairHexLine}>
                  <span>
                    {pair.originalHexA} / {pair.originalHexB}
                  </span>
                  <span>
                    → {pair.simulatedHexA} / {pair.simulatedHexB}
                  </span>
                </div>

                <div className={styles.pairMetricChips}>
                  <span>
                    ΔE₀₀ <strong>{pair.originalDeltaE.toFixed(2)}</strong> →{' '}
                    <strong>{pair.simulatedDeltaE.toFixed(2)}</strong> (
                    {(pair.relativeLoss * 100).toFixed(0)}% lost)
                  </span>
                  <span
                    title={`Global ${(pair.globalWeight * 100).toFixed(1)}% · Local ${(pair.localWeight * 100).toFixed(1)}%`}
                  >
                    Wt <strong>{(pair.combinedWeight * 100).toFixed(1)}%</strong>
                  </span>
                  {isSelected && (
                    <span
                      style={{
                        color: 'var(--blue)',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <Layers size={11} aria-hidden="true" />
                      On image
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {sortedPairs.length > 15 && (
            <button
              type="button"
              className="textLink"
              style={{ fontSize: 12, padding: '4px 0', minHeight: 32 }}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? 'Show top 15 pairs' : `Show all ${sortedPairs.length} eligible pairs`}
            </button>
          )}
        </div>
      )}
    </>
  );
}
