'use client';
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
    <>
      <div className={styles.inspectorSubHeader}>
        <h2 id="palette-explorer-heading">
          CIELAB Palette ({result.clusterCount})
        </h2>
        {selectedClusterId !== null && (
          <button
            type="button"
            className="textLink"
            style={{ minHeight: 24, padding: 0, fontSize: 11.5 }}
            onClick={() => onSelectCluster(null)}
          >
            Clear selection
          </button>
        )}
      </div>

      <p className="note" style={{ margin: 0, fontSize: 11.5 }}>
        MiniBatch K-means representative colours (left: original, right: {selectedCvd}). Click any
        swatch to highlight its pixels on the image.
      </p>

      {inspected && inspectedSim && (
        <div className={styles.clusterDetailCard}>
          <strong>Cluster #{inspected.id + 1}</strong> · <code>{inspected.hex}</code> →{' '}
          <code>{inspectedSim.simulatedHex}</code>
          <br />
          L* {inspected.lab[0].toFixed(1)}, a* {inspected.lab[1].toFixed(1)}, b*{' '}
          {inspected.lab[2].toFixed(1)} · {inspected.pixelCount.toLocaleString()} px (
          {(inspected.frequency * 100).toFixed(2)}%) ·{' '}
          {inspected.eligible ? 'Eligible' : '< min freq'}
        </div>
      )}

      <div className={styles.paletteCompactList}>
        {sortedClusters.map((cluster) => {
          const sim = simById.get(cluster.id);
          const active = selectedClusterId === cluster.id;
          return (
            <button
              key={cluster.id}
              type="button"
              className={`${styles.clusterRowCard} ${active ? styles.clusterRowActive : ''}`}
              aria-pressed={active}
              onClick={() => onSelectCluster(active ? null : cluster.id)}
            >
              <div className={styles.clusterSplit} aria-hidden="true">
                <div style={{ backgroundColor: cluster.hex }} />
                <div style={{ backgroundColor: sim?.simulatedHex ?? cluster.hex }} />
              </div>
              <div className={styles.clusterMetaLine}>
                <strong>{(cluster.frequency * 100).toFixed(1)}%</strong>
                <span className="note" style={{ fontSize: 10 }}>
                  {cluster.eligible ? 'Eligible' : '< 0.5%'}
                </span>
              </div>
              <div className={styles.clusterHexSmall}>
                <span>{cluster.hex}</span>
                <span>{sim?.simulatedHex ?? cluster.hex}</span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
