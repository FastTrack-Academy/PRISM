// Original educational fixtures, drawn as vector source so the demo is reproducible.
export function sampleSVG(page = 1): string {
  const title =
    page === 1
      ? 'Cell membrane transport'
      : page === 2
        ? 'Reading a population chart'
        : 'The ecosystem cycle';
  const body =
    page === 1
      ? `
    <text x="68" y="212" font-size="17" fill="#475569">Outside the cell</text>
    ${Array.from({ length: 19 }, (_, i) => `<g fill="#65a785" stroke="#39705b" stroke-width="1.2"><circle cx="${90 + i * 30}" cy="340" r="10"/><path d="M${86 + i * 30} 350v40m8-40v40" fill="none" stroke-width="2"/><circle cx="${90 + i * 30}" cy="400" r="10"/></g>`).join('')}
    <rect x="218" y="310" width="78" height="122" rx="30" fill="#ae9bcc" stroke="#7d659e" stroke-width="2"/>
    <rect x="502" y="310" width="78" height="122" rx="30" fill="#ae9bcc" stroke="#7d659e" stroke-width="2"/>
    <path d="M120 282 H290 V255 L339 295 L290 335 V308 H120Z" fill="#bf4940"/>
    <path d="M120 308 H290 V335 L339 375 L290 415 V388 H120Z" fill="#6d833e"/>
    ${[
      [132, 240],
      [200, 233],
      [393, 257],
      [463, 237],
      [595, 254],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#e9b446" stroke="#b48528"/>`)
      .join('')}
    ${[
      [370, 452],
      [430, 475],
      [625, 458],
    ]
      .map(([x, y]) => `<rect x="${x}" y="${y}" width="14" height="14" rx="2" fill="#6d833e"/>`)
      .join('')}
    <path d="M541 270v58m0 78v80" stroke="#283346" stroke-width="2" marker-end="url(#arrow)"/>
    <text x="68" y="496" font-size="17" fill="#475569">Inside the cell</text>
    <text x="69" y="557" font-size="17" font-weight="600">Figure 2.4</text><text x="160" y="557" font-size="17">Movement through a selectively permeable membrane.</text>
    <rect x="68" y="594" width="603" height="115" rx="3" fill="#f8fafc" stroke="#dce2e9"/>
    <text x="88" y="621" font-size="16" font-weight="600">Key</text>
    <circle cx="96" cy="650" r="8" fill="#e9b446"/><text x="116" y="656" font-size="15">Sodium ion</text>
    <rect x="283" y="642" width="14" height="14" fill="#6d833e"/><text x="307" y="656" font-size="15">Potassium ion</text>
    <rect x="493" y="642" width="14" height="14" fill="#bf4940"/><text x="517" y="656" font-size="15">Transport path</text>
    <text x="68" y="753" font-size="18" font-weight="600">Think about it</text>
    <text x="68" y="786" font-size="16">Can you follow each path without using its color?</text>
    <text x="68" y="815" font-size="16">Labels, patterns, and clear boundaries can help.</text>
  `
      : page === 2
        ? `
    <text x="68" y="220" font-size="18" font-weight="600">Population changes over time</text>
    <path d="M100 280v300h560" fill="none" stroke="#283346" stroke-width="2"/>
    ${[0, 1, 2, 3].map((i) => `<line x1="100" x2="660" y1="${280 + i * 75}" y2="${280 + i * 75}" stroke="#e6eaf0"/>`).join('')}
    <path d="M100 530 L200 480 L300 460 L400 410 L500 340 L650 300" fill="none" stroke="#bf4940" stroke-width="7"/>
    <path d="M100 535 L200 490 L300 475 L400 425 L500 360 L650 320" fill="none" stroke="#6d833e" stroke-width="7"/>
    <text x="100" y="611" font-size="16">Year 1</text><text x="600" y="611" font-size="16">Year 6</text>
    <rect x="120" y="657" width="22" height="14" fill="#bf4940"/><text x="156" y="671" font-size="16">Species A</text>
    <rect x="350" y="657" width="22" height="14" fill="#6d833e"/><text x="386" y="671" font-size="16">Species B</text>
    <text x="68" y="748" font-size="17">A solid line and a dashed line would add another cue.</text>
    <text x="68" y="797" font-size="17" fill="#9aa5b5">This caption demonstrates text with low contrast.</text>
  `
        : `
    <text x="68" y="229" font-size="18" font-weight="600">Matter moves through an ecosystem</text>
    <rect x="105" y="320" width="175" height="170" fill="#bf4940"/>
    <rect x="280" y="320" width="175" height="170" fill="#6d833e"/>
    <rect x="455" y="320" width="175" height="170" fill="#4685c3"/>
    <text x="137" y="408" font-size="20" fill="white">Producers</text>
    <text x="301" y="408" font-size="20" fill="white">Consumers</text>
    <text x="483" y="408" font-size="20" fill="white">Nutrients</text>
    <path d="M185 540H570" stroke="#283346" stroke-width="2" marker-end="url(#arrow)"/>
    <text x="175" y="610" font-size="17">Color groups information. Labels explain its meaning.</text>
    <text x="68" y="731" font-size="18" font-weight="600">Review the diagram</text>
    <text x="68" y="767" font-size="16">Which neighboring regions become difficult to separate?</text>
    <text x="68" y="800" font-size="16">Compare each simulation before choosing a change.</text>
  `;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="940" viewBox="0 0 740 940"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#283346"/></marker></defs><rect width="740" height="940" fill="white"/><g font-family="Arial, sans-serif" fill="#172338"><text x="68" y="63" font-size="12" letter-spacing="2" fill="#64748b">BIOLOGY · EXPLORING LIVING SYSTEMS</text><text x="68" y="115" font-size="30" font-weight="600">2.${page}  ${title}</text><text x="68" y="158" font-size="17">Observe the diagram and consider how its colors communicate.</text><line x1="68" y1="182" x2="672" y2="182" stroke="#dce2e9"/>${body}<line x1="68" y1="870" x2="672" y2="870" stroke="#dce2e9"/><text x="68" y="898" font-size="12" fill="#64748b">PRISM · Original educational sample</text><text x="653" y="898" font-size="12">${page}</text></g></svg>`;
}
