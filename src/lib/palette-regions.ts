import {lab} from './color';
import {slic} from './superpixels';
import type {Raster,Region,RGB} from './types';

const squared=(a:RGB,b:RGB)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;

// Pick the mean within the most common RGB bin. This keeps a thin black
// outline from turning the measured interior of an orange dot brown.
function representativeColors(r:Raster,labels:Int32Array,count:number):RGB[]{
  const bins=Array.from({length:count},()=>new Map<number,number>());
  const winners=new Int32Array(count), totals=new Uint32Array(count);
  function bin(p:number){
    const i=4*p;
    return (r.data[i]>>4)*256+(r.data[i+1]>>4)*16+(r.data[i+2]>>4);
  }
  for(let p=0;p<labels.length;p++){
    const id=labels[p];
    if(id<0)continue;
    const key=bin(p),n=(bins[id].get(key)??0)+1;
    bins[id].set(key,n);
    if(n>totals[id]){totals[id]=n;winners[id]=key;}
  }
  const colors:RGB[]=Array.from({length:count},()=>[0,0,0]);
  for(let p=0;p<labels.length;p++){
    const id=labels[p];
    if(id<0 || bin(p)!==winners[id])continue;
    for(let ch=0;ch<3;ch++)colors[id][ch]+=r.data[4*p+ch];
  }
  return colors.map((c,i)=>c.map(v=>v/totals[i]) as RGB);
}

// Deterministic area-weighted Lloyd clustering of patch representatives in Lab.
function paletteAssignments(colors:RGB[],regions:Region[]){
  const points=colors.map(lab);
  const group=new Int32Array(points.length);
  if(!points.length)return group;
  const biggest=regions.reduce((a,b)=>a.area>=b.area?a:b);
  const centers=[points[biggest.id]];
  const nearest=new Float64Array(points.length).fill(Infinity);
  while(centers.length<12){
    let next=-1,best=0;
    for(let i=0;i<points.length;i++){
      nearest[i]=Math.min(nearest[i],squared(points[i],centers[centers.length-1]));
      const priority=nearest[i]*Math.sqrt(regions[i].area);
      if(nearest[i]>=8**2 && priority>best){next=i;best=priority;}
    }
    if(next<0)break;
    centers.push(points[next]);
  }
  for(let iteration=0;iteration<12;iteration++){
    const sums=centers.map(()=>[0,0,0,0]);
    let changed=false;
    for(let i=0;i<points.length;i++){
      let index=0,distance=Infinity;
      centers.forEach((center,k)=>{const d=squared(points[i],center);if(d<distance){distance=d;index=k;}});
      changed ||= group[i]!==index;
      group[i]=index;
      const sum=sums[index],weight=regions[i].area;
      for(let ch=0;ch<3;ch++)sum[ch]+=points[i][ch]*weight;
      sum[3]+=weight;
    }
    if(iteration>0 && !changed)break;
    sums.forEach((s,i)=>{if(s[3])centers[i]=[s[0]/s[3],s[1]/s[3],s[2]/s[3]];});
  }
  return group;
}
export function mergedPalette(r:Raster,spacing:number){
  const patches=slic(r,spacing);
  const colors=representativeColors(r,patches.labels,patches.regions.length);
  const cluster=paletteAssignments(colors,patches.regions);
  const parent=Int32Array.from(cluster,(_,i)=>i);
  function root(i:number){
    while(i!==parent[i]){parent[i]=parent[parent[i]];i=parent[i];}
    return i;
  }
  function join(a:number,b:number){
    if(b>=0 && a!==b && cluster[a]===cluster[b])parent[root(b)]=root(a);
  }
  const labels=patches.labels;
  for(let p=0;p<labels.length;p++){
    const a=labels[p];
    if(a<0)continue;
    if(p%r.width)join(a,labels[p-1]);
    if(p>=r.width)join(a,labels[p-r.width]);
  }
  const ids=new Map<number,number>(),regions:Region[]=[],palette:number[]=[];
  const remap=new Int32Array(cluster.length);
  for(const patch of patches.regions){
    const component=root(patch.id);
    let id=ids.get(component);
    if(id===undefined){
      id=regions.length;ids.set(component,id);
      regions.push({...patch,id,box:{...patch.box},area:0});
      palette.push(cluster[patch.id]);
    }
    const region=regions[id], a=region.box,b=patch.box;
    const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
    region.box={x,y,width:Math.max(a.x+a.width,b.x+b.width)-x,height:Math.max(a.y+a.height,b.y+b.height)-y};
    region.area+=patch.area;
    remap[patch.id]=id;
  }
  for(let p=0;p<labels.length;p++)if(labels[p]>=0)labels[p]=remap[labels[p]];
  const measured=representativeColors(r,labels,regions.length);
  regions.forEach((region,i)=>{region.color=measured[i];});
  return {regions,labels,palette};
}
