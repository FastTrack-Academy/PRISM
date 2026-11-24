'use client';
import { Palette } from 'lucide-react';
import type { CvdType, PcciAnalysisResult } from '@/lib/pcci';
import styles from './dashboard.module.css';

export function PaletteExplorer({
  result,
  selectedCvd,
  selectedClusterId,
  onSelectCluster,
}: {
  result: PcciAnalysisResult;
  selectedCvd: CvdType;
  selectedClusterId: number | null;
  onSelectCluster: (clusterId: number | null) => void;
}) {
  const simById = new Map(
    result.cvd[selectedCvd].simulatedPalette.map((item) => [item.clusterId, item]),
  );

  const sortedClusters = [...result.clusters].sort((a, b) => b.frequency - a.frequency);
  const inspected =
    selectedClusterId !== null ? result.clusters.find((c) => c.id === selectedClusterId) : null;
  const inspectedSim = inspected ? simById.get(inspected.id) : null;

  return (
    <section className={styles.panel} aria-labelledby="palette-explorer-heading">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="palette-explorer-heading">
            <Palette size={18} aria-hidden="true" />
            Extracted CIELAB Colour Palette ({result.clusterCount} clusters)
          </h2>
          <p className={styles.sectionHint} style={{ marginTop: 4 }}>
            MiniBatch K-means in CIELAB space summarizes the computational image (
            {result.computationalDimensions.width} × {result.computationalDimensions.height} px)
            into representative colours. Left half: original; right half: {selectedCvd} simulation.
          </p>
        </div>
        {selectedClusterId !== null && (
          <button
            type="button"
            className="button"
            style={{ minHeight: 34, padding: '5px 11px', fontSize: 12 }}
            onClick={() => onSelectCluster(null)}
          >
            Clear cluster selection
          </button>
        )}
      </div>

      <div className={styles.panelBody}>
        <div className={styles.paletteGrid}>
          {sortedClusters.map((cluster) => {
            const sim = simById.get(cluster.id);
            const active = selectedClusterId === cluster.id;
            return (
              <button
                key={cluster.id}
                type="button"
                className={`${styles.clusterCard} ${active ? styles.clusterCardActive : ''}`}
                aria-pressed={active}
                onClick={() => onSelectCluster(active ? null : cluster.id)}
              >
                <div className={styles.clusterSwatches} aria-hidden="true">
                  <div style={{ backgroundColor: cluster.hex }} />
                  <div style={{ backgroundColor: sim?.simulatedHex ?? cluster.hex }} />
                </div>
                <div className={styles.clusterMeta}>
                  <strong>{(cluster.frequency * 100).toFixed(2)}%</strong>
                  <span className="note">
                    {cluster.eligible ? 'Eligible' : '< min freq'}
                  </span>
                </div>
                <div className={styles.clusterHexRow}>
                  <span>{cluster.hex}</span>
                  <span>→ {sim?.simulatedHex ?? cluster.hex}</span>
                </div>
              </button>
            );
          })}
        </div>

        {inspected && inspectedSim && (
          <div className={styles.clusterInspector}>
            <div>
              <strong>Cluster #{inspected.id + 1}</strong> · Original{' '}
              <code>{inspected.hex}</code> → {selectedCvd} <code>{inspectedSim.simulatedHex}</code>
            </div>
            <div>
              CIELAB: L* {inspected.lab[0].toFixed(1)}, a* {inspected.lab[1].toFixed(1)}, b*{' '}
              {inspected.lab[2].toFixed(1)} · {inspected.pixelCount.toLocaleString()} px (
              {(inspected.frequency * 100).toFixed(2)}%) ·{' '}
              {inspected.eligible ? 'Eligible for pair scoring' : 'Excluded (< min frequency)'}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
