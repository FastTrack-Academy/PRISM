'use client';
import { useMemo, useState } from 'react';
import { ArrowUpDown, FileSpreadsheet } from 'lucide-react';
import { CVD_TYPES, type CvdType } from '@/lib/pcci';
import type { PcciPageRecord } from '../session';
import styles from './dashboard.module.css';

type SortCol = 'page' | CvdType | 'pairs';

export function PdfSummaryTable({
  records,
  totalDocPages,
  activePageIndex,
  onSelectPageIndex,
}: {
  records: PcciPageRecord[];
  totalDocPages: number;
  activePageIndex: number;
  onSelectPageIndex: (index: number) => void;
}) {
  const [sortCol, setSortCol] = useState<SortCol>('Deuteranopia');
  const [sortDesc, setSortDesc] = useState(true);

  const summary = useMemo(() => {
    const out = {} as Record<CvdType, { mean: number; max: number; maxPage: number }>;
    for (const cvd of CVD_TYPES) {
      let sum = 0;
      let max = -1;
      let maxPage = records[0]?.pageNumber ?? 1;
      for (const rec of records) {
        const s = rec.analysis.cvd[cvd].pcciScore;
        sum += s;
        if (s > max) {
          max = s;
          maxPage = rec.pageNumber;
        }
      }
      out[cvd] = {
        mean: records.length ? sum / records.length : 0,
        max: max < 0 ? 0 : max,
        maxPage,
      };
    }
    return out;
  }, [records]);

  const sortedRows = useMemo(() => {
    const indexed = records.map((rec, originalIndex) => ({ rec, originalIndex }));
    indexed.sort((a, b) => {
      let diff = 0;
      if (sortCol === 'page') diff = a.rec.pageNumber - b.rec.pageNumber;
      else if (sortCol === 'pairs')
        diff = a.rec.analysis.eligiblePairCount - b.rec.analysis.eligiblePairCount;
      else
        diff = a.rec.analysis.cvd[sortCol].pcciScore - b.rec.analysis.cvd[sortCol].pcciScore;
      return sortDesc ? -diff : diff;
    });
    return indexed;
  }, [records, sortCol, sortDesc]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDesc((d) => !d);
    else {
      setSortCol(col);
      setSortDesc(col !== 'page');
    }
  };

  if (totalDocPages <= 1 && records.length <= 1) return null;

  const isPartial = records.length < totalDocPages;

  return (
    <section className={styles.panel} aria-labelledby="pdf-summary-heading">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="pdf-summary-heading">
            <FileSpreadsheet size={18} aria-hidden="true" />
            Page-Level PCCI Summary ({records.length} of {totalDocPages} pages analyzed)
          </h2>
          <p className={styles.sectionHint} style={{ marginTop: 4 }}>
            {isPartial
              ? `Partial-page selection (${records.length} of ${totalDocPages} pages). This is not a complete document assessment.`
              : `All ${totalDocPages} document pages analyzed independently. Mean and maximum page risks are reported separately per CVD type.`}
          </p>
        </div>
      </div>

      <div className={styles.panelBody}>
        <div className={styles.pdfSummaryGrid}>
          {CVD_TYPES.map((cvd) => (
            <div key={cvd} className={styles.pdfStatCard}>
              <strong>{cvd}</strong>
              <span>
                Mean page risk: <strong>{summary[cvd].mean.toFixed(1)}</strong> / 100
              </span>
              <span>
                Max page risk: <strong>{summary[cvd].max.toFixed(1)}</strong> / 100 (Page{' '}
                {summary[cvd].maxPage})
              </span>
            </div>
          ))}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.pairTable}>
            <thead>
              <tr>
                {(
                  [
                    ['page', 'Page'],
                    ['Deuteranopia', 'Deuteranopia'],
                    ['Protanopia', 'Protanopia'],
                    ['Tritanopia', 'Tritanopia'],
                    ['pairs', 'Eligible pairs'],
                  ] as Array<[SortCol, string]>
                ).map(([col, label]) => (
                  <th key={col}>
                    <button
                      type="button"
                      className="textLink"
                      style={{
                        minHeight: 28,
                        padding: 0,
                        fontSize: 11,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: sortCol === col ? 'var(--blue)' : 'var(--muted)',
                      }}
                      onClick={() => toggleSort(col)}
                    >
                      {label}
                      <ArrowUpDown size={12} aria-hidden="true" />
                    </button>
                  </th>
                ))}
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(({ rec, originalIndex }) => {
                const active = originalIndex === activePageIndex;
                return (
                  <tr
                    key={rec.pageNumber}
                    className={`${styles.pairRowClickable} ${active ? styles.pairRowActive : ''}`}
                    onClick={() => onSelectPageIndex(originalIndex)}
                  >
                    <td>
                      <strong>Page {rec.pageNumber}</strong>
                    </td>
                    <td>{rec.analysis.cvd.Deuteranopia.pcciScore.toFixed(1)}</td>
                    <td>{rec.analysis.cvd.Protanopia.pcciScore.toFixed(1)}</td>
                    <td>{rec.analysis.cvd.Tritanopia.pcciScore.toFixed(1)}</td>
                    <td>{rec.analysis.eligiblePairCount}</td>
                    <td>{rec.analysis.status === 'ok' ? 'Scored' : 'No eligible pairs'}</td>
                    <td>
                      <button
                        type="button"
                        className="button"
                        style={{ minHeight: 30, padding: '4px 10px', fontSize: 11 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPageIndex(originalIndex);
                        }}
                      >
                        {active ? 'Viewing' : 'Inspect page'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
