'use client';
import { useMemo, useState } from 'react';
import { HelpCircle, Layers } from 'lucide-react';
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

  const visiblePairs = showAll ? sortedPairs : sortedPairs.slice(0, 12);

  return (
    <section className={styles.panel} aria-labelledby="why-score-heading">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="why-score-heading">
            <HelpCircle size={18} aria-hidden="true" />
            Why this score? — {selectedCvd}
          </h2>
          <p className={styles.sectionHint} style={{ marginTop: 4 }}>
            Image-level PCCI (<strong>{cvdData.pcciScore.toFixed(1)} / 100</strong>) is the weighted
            mean pairwise risk across the top{' '}
            <strong>{(result.config.tailProportion * 100).toFixed(0)}%</strong> of cumulative
            eligible pair weight—distinct from any single pair’s individual risk score.
          </p>
        </div>

        <div className={styles.segmented} role="group" aria-label="Sort colour pairs">
          <button
            type="button"
            aria-pressed={sortBy === 'pairwiseRisk'}
            onClick={() => setSortBy('pairwiseRisk')}
          >
            Pairwise risk
          </button>
          <button
            type="button"
            aria-pressed={sortBy === 'combinedWeight'}
            onClick={() => setSortBy('combinedWeight')}
          >
            Combined weight
          </button>
          <button
            type="button"
            aria-pressed={sortBy === 'weightedContribution'}
            onClick={() => setSortBy('weightedContribution')}
          >
            Weighted contribution
          </button>
        </div>
      </div>

      <div className={styles.panelBody}>
        {sortedPairs.length === 0 ? (
          <div className={styles.statusNotice}>
            <span>
              No eligible colour pairs met the thresholds (original ΔE₀₀ ≥{' '}
              {result.config.minOriginalDeltaE}, each cluster ≥{' '}
              {(result.config.minClusterFrequency * 100).toFixed(2)}% of image pixels). Zero
              detected risk here does not prove educational accessibility.
            </span>
          </div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.pairTable}>
                <thead>
                  <tr>
                    <th>Original pair</th>
                    <th>Simulated ({selectedCvd})</th>
                    <th>Original ΔE₀₀</th>
                    <th>Remaining ΔE₀₀</th>
                    <th>Lost (%)</th>
                    <th>Pairwise risk</th>
                    <th>Combined weight</th>
                    <th>Locate</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePairs.map((pair) => {
                    const isSelected =
                      selectedPair?.clusterA === pair.clusterA &&
                      selectedPair?.clusterB === pair.clusterB;
                    return (
                      <tr
                        key={`${pair.clusterA}-${pair.clusterB}`}
                        className={`${styles.pairRowClickable} ${isSelected ? styles.pairRowActive : ''}`}
                        onClick={() => onSelectPair(pair)}
                      >
                        <td>
                          <div className={styles.swatchPair}>
                            <span className={styles.swatchBlock}>
                              <span
                                className={styles.swatchSquare}
                                style={{ backgroundColor: pair.originalHexA }}
                                aria-hidden="true"
                              />
                              {pair.originalHexA}
                            </span>
                            <span className="note">vs</span>
                            <span className={styles.swatchBlock}>
                              <span
                                className={styles.swatchSquare}
                                style={{ backgroundColor: pair.originalHexB }}
                                aria-hidden="true"
                              />
                              {pair.originalHexB}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.swatchPair}>
                            <span className={styles.swatchBlock}>
                              <span
                                className={styles.swatchSquare}
                                style={{ backgroundColor: pair.simulatedHexA }}
                                aria-hidden="true"
                              />
                              {pair.simulatedHexA}
                            </span>
                            <span className="note">vs</span>
                            <span className={styles.swatchBlock}>
                              <span
                                className={styles.swatchSquare}
                                style={{ backgroundColor: pair.simulatedHexB }}
                                aria-hidden="true"
                              />
                              {pair.simulatedHexB}
                            </span>
                          </div>
                        </td>
                        <td>{pair.originalDeltaE.toFixed(2)}</td>
                        <td>{pair.simulatedDeltaE.toFixed(2)}</td>
                        <td>{(pair.relativeLoss * 100).toFixed(1)}%</td>
                        <td>
                          <strong>{(pair.pairwiseRisk * 100).toFixed(1)}</strong>
                          {pair.tailIncludedWeight > 0 && (
                            <span className={styles.tailTag}>Top {(result.config.tailProportion * 100).toFixed(0)}%</span>
                          )}
                        </td>
                        <td
                          title={`Global weight: ${(pair.globalWeight * 100).toFixed(2)}% · Local spatial weight: ${(pair.localWeight * 100).toFixed(2)}%`}
                        >
                          {(pair.combinedWeight * 100).toFixed(2)}%
                          <div className="note" style={{ fontSize: 10 }}>
                            G {(pair.globalWeight * 100).toFixed(1)}% · L{' '}
                            {(pair.localWeight * 100).toFixed(1)}%
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button"
                            style={{ minHeight: 30, padding: '4px 9px', fontSize: 11 }}
                            aria-pressed={isSelected}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectPair(pair);
                            }}
                          >
                            <Layers size={13} aria-hidden="true" />
                            {isSelected ? 'Selected' : 'Inspect'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {sortedPairs.length > 12 && (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="textLink"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll
                    ? 'Show top 12 pairs'
                    : `Show all ${sortedPairs.length} eligible colour pairs`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
