import {clamp,lab} from './color';
import {pairMetrics} from './engine';
import {figureSpacing,reviewRisk,type PairEvidence,type ProfileResult} from './figure';
import {mergedPalette} from './palette-regions';
import {CVD_MODES,type Raster} from './types';

export const STAGE1_VERSION='stage1-palette-1';
export const riskScore=(profile:ProfileResult)=>profile.strongest?Math.round(100*profile.strongest.metric.risk):null;
type SupportedPair=PairEvidence & {support:number};
export function scoreStage1(r:Raster){
  const spacing=figureSpacing(r);
  const {regions,labels,palette}=mergedPalette(r,spacing);
  const neutral=regions.map(v=>Math.hypot(...lab(v.color).slice(1))<12);
  const edges=new Map<number,number>();
  // Trace four orientations. Only neutral or unassigned pixels may form a gap.
  for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]){
    const step=dx+dy*r.width,limit=1+Math.floor(spacing/Math.hypot(dx,dy));
    for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
      const p=y*r.width+x,a=labels[p];
      if(a<0 || labels[p+step]===a)continue;
      for(let d=1;d<=limit;d++){
        const xx=x+d*dx,yy=y+d*dy;
        if(xx<0 || xx>=r.width || yy>=r.height)break;
        const b=labels[p+d*step];
        if(b===a)break;
        if(b<0)continue;
        if(palette[a]!==palette[b] && (d===1 || (!neutral[a] && !neutral[b]))){
          const key=Math.min(a,b)*regions.length+Math.max(a,b);
          edges.set(key,(edges.get(key)??0)+1);
        }
        if(neutral[a] || !neutral[b])break;
      }
    }
  }
  const profiles:ProfileResult[]=CVD_MODES.map(mode=>({mode,examined:0,strongest:null,warnings:[]}));
  const groups=CVD_MODES.map(()=>new Map<number,SupportedPair[]>());
  for(const [key,support] of edges){
    const a=Math.floor(key/regions.length),b=key%regions.length;
    if(support<3 || Math.min(regions[a].area,regions[b].area)<Math.max(4,spacing*spacing/8) || (neutral[a]&&neutral[b]))continue;
    const pair=pairMetrics(regions[a].color,regions[b].color);
    if(pair.normal<12)continue;
    const family=12*Math.min(palette[a],palette[b])+Math.max(palette[a],palette[b]);
    pair.metrics.forEach((m,i)=>{
      profiles[i].examined++;
      const risk=clamp(1-m.deltaE/15)*clamp(1-m.retention);
      const local={a,b,normal:pair.normal,metric:{...m,risk},support:Math.min(support,4*spacing),examples:1};
      const group=groups[i].get(family);
      if(group)group.push(local);else groups[i].set(family,[local]);
    });
  }
  profiles.forEach((profile,i)=>{
    const representatives:PairEvidence[]=[];
    for(const pairs of groups[i].values()){
      pairs.sort((a,b)=>a.metric.risk-b.metric.risk || b.support-a.support || a.a-b.a || a.b-b.b);
      const half=pairs.reduce((s,p)=>s+p.support,0)/2;
      let accumulated=0;
      const middle=pairs.find(p=>{accumulated+=p.support;return accumulated>=half;})!;
      representatives.push({...middle,examples:pairs.length});
    }
    representatives.sort((a,b)=>b.metric.risk-a.metric.risk || a.a-b.a || a.b-b.b);
    for(const p of representatives)p.metric={...p.metric,risk:Math.round(100*p.metric.risk)/100};
    profile.strongest=representatives[0]??null;
    profile.warnings=representatives.filter(p=>p.metric.risk>=reviewRisk);
  });
  return {spacing,regions,labels,profiles};
}
export type Stage1Result=ReturnType<typeof scoreStage1>;
