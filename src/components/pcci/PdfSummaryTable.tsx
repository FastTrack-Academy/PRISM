'use client';
import { useMemo, useState } from 'react';
import { CVD_TYPES, type CvdType } from '@/lib/pcci';
import type { PcciPageRecord } from '../session';
import styles from './dashboard.module.css';

type SortCol = 'page' | CvdType;

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
      const diff =
        sortCol === 'page'
          ? a.rec.pageNumber - b.rec.pageNumber
          : a.rec.analysis.cvd[sortCol].pcciScore - b.rec.analysis.cvd[sortCol].pcciScore;
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

  const isPartial = records.length < totalDocPages;

  return (
    <>
      <div className={styles.inspectorSubHeader}>
        <h2 id="pdf-summary-heading">
          Pages ({records.length} of {totalDocPages} analyzed)
        </h2>
        <div className={styles.sortPills} role="group" aria-label="Sort pages">
          {(
            [
              ['page', '#'],
              ['Deuteranopia', 'D'],
              ['Protanopia', 'P'],
              ['Tritanopia', 'T'],
            ] as Array<[SortCol, string]>
          ).map(([col, short]) => (
            <button
              key={col}
              type="button"
              aria-pressed={sortCol === col}
              title={`Sort by ${col}`}
              onClick={() => toggleSort(col)}
            >
              {short}
            </button>
          ))}
        </div>
      </div>

      <p className="note" style={{ margin: 0, fontSize: 11.5 }}>
        {isPartial
          ? `Partial selection (${records.length}/${totalDocPages} pages). Not a complete document assessment.`
          : `All ${totalDocPages} pages analyzed independently.`}
      </p>

      <div className={styles.pdfCompactSummary}>
        {CVD_TYPES.map((cvd) => (
          <div key={cvd} className={styles.pdfMiniStat}>
            <strong>{cvd.slice(0, 4)}.</strong>
            <span>Avg {summary[cvd].mean.toFixed(1)}</span>
            <span>
              Max {summary[cvd].max.toFixed(1)} (p.{summary[cvd].maxPage})
            </span>
          </div>
        ))}
      </div>

      <div className={styles.pairCardList}>
        {sortedRows.map(({ rec, originalIndex }) => {
          const active = originalIndex === activePageIndex;
          return (
            <button
              key={rec.pageNumber}
              type="button"
              className={`${styles.pdfPageRow} ${active ? styles.pdfPageRowActive : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelectPageIndex(originalIndex)}
            >
              <strong>Page {rec.pageNumber}</strong>
              <span>
                D {rec.analysis.cvd.Deuteranopia.pcciScore.toFixed(1)} · P{' '}
                {rec.analysis.cvd.Protanopia.pcciScore.toFixed(1)} · T{' '}
                {rec.analysis.cvd.Tritanopia.pcciScore.toFixed(1)}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
