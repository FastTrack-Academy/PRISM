import { CVD_TYPES, type CvdType, type PcciAnalysisResult } from './types';

function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Serialize one or more PCCI analysis results to a formatted JSON string
 * including algorithm version, full configuration, and research disclaimers.
 */
export function serializeResultsJson(results: PcciAnalysisResult[]): string {
  return JSON.stringify(
    {
      schema: 'prism-pcci-export-v1',
      exportedAt: new Date().toISOString(),
      algorithmVersion: results[0]?.algorithmVersion ?? 'PCCI-1.0.0-stage1',
      disclaimers: results[0]?.disclaimers ?? [],
      pages: results,
    },
    null,
    2,
  );
}

/**
 * Serialize image/page-level PCCI scores to CSV (compatible with prism_stage1_results.csv columns
 * plus algorithm version, config summary, status, and research disclaimer note).
 */
export function serializeScoresCsv(results: PcciAnalysisResult[]): string {
  const header = [
    'image',
    'page_number',
    'cvd',
    'pcci_score',
    'mean_risk',
    'high_risk_pair_weight_share_percent',
    'eligible_pair_count',
    'cluster_count',
    'max_risk_pair_original_de',
    'max_risk_pair_simulated_de',
    'max_risk_pair_color_1',
    'max_risk_pair_color_2',
    'status',
    'algorithm_version',
    'is_default_config',
    'k',
    'tau',
    'min_original_de',
    'min_cluster_freq',
    'global_weight',
    'tail_proportion',
    'alpha_compositing',
    'disclaimer',
  ];

  const disclaimerNote =
    'Experimental PCCI estimate of potential colour confusion; not a clinical probability or accessibility certification.';

  const rows: string[] = [header.join(',')];

  for (const res of results) {
    for (const cvdType of CVD_TYPES) {
      const c = res.cvd[cvdType];
      const top = c.pairs[0];
      rows.push(
        [
          res.imageName,
          res.pageNumber ?? 1,
          cvdType,
          c.pcciScore.toFixed(6),
          c.meanRisk.toFixed(6),
          c.highRiskPairWeightShare.toFixed(6),
          c.eligiblePairCount,
          res.clusterCount,
          top ? top.originalDeltaE.toFixed(6) : '',
          top ? top.simulatedDeltaE.toFixed(6) : '',
          top ? top.originalHexA : '',
          top ? top.originalHexB : '',
          res.status,
          res.algorithmVersion,
          res.isDefaultConfig ? 'true' : 'false',
          res.config.k,
          res.config.tau,
          res.config.minOriginalDeltaE,
          res.config.minClusterFrequency,
          res.config.globalWeight,
          res.config.tailProportion,
          res.config.alphaCompositing,
          disclaimerNote,
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }

  return rows.join('\n') + '\n';
}

/**
 * Serialize detailed colour-pair evidence to CSV for one or all CVD types.
 */
export function serializePairEvidenceCsv(
  results: PcciAnalysisResult[],
  filterCvd?: CvdType,
): string {
  const header = [
    'image',
    'page_number',
    'cvd',
    'rank',
    'cluster_a',
    'cluster_b',
    'original_hex_a',
    'original_hex_b',
    'simulated_hex_a',
    'simulated_hex_b',
    'original_delta_e2000',
    'simulated_delta_e2000',
    'relative_loss_percent',
    'remaining_distance_penalty',
    'pairwise_risk_0_100',
    'global_weight',
    'local_weight',
    'combined_weight',
    'weighted_contribution',
    'tail_included_weight',
    'algorithm_version',
    'disclaimer',
  ];

  const disclaimerNote =
    'Experimental PCCI pair-level colour-confusion evidence; contextual cues require separate assessment.';
  const rows: string[] = [header.join(',')];
  const types: readonly CvdType[] = filterCvd ? [filterCvd] : CVD_TYPES;

  for (const res of results) {
    for (const cvdType of types) {
      const c = res.cvd[cvdType];
      c.pairs.forEach((p, idx) => {
        rows.push(
          [
            res.imageName,
            res.pageNumber ?? 1,
            cvdType,
            idx + 1,
            p.clusterA,
            p.clusterB,
            p.originalHexA,
            p.originalHexB,
            p.simulatedHexA,
            p.simulatedHexB,
            p.originalDeltaE.toFixed(4),
            p.simulatedDeltaE.toFixed(4),
            (p.relativeLoss * 100).toFixed(2),
            p.remainingDistancePenalty.toFixed(6),
            (p.pairwiseRisk * 100).toFixed(4),
            p.globalWeight.toFixed(6),
            p.localWeight.toFixed(6),
            p.combinedWeight.toFixed(6),
            p.weightedContribution.toFixed(6),
            p.tailIncludedWeight.toFixed(6),
            res.algorithmVersion,
            disclaimerNote,
          ]
            .map(csvEscape)
            .join(','),
        );
      });
    }
  }

  return rows.join('\n') + '\n';
}
