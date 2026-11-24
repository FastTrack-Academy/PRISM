import type {Raster} from './types';

// Area-average source pixels onto the same analysis grid in the browser and CLI.
export function figureRaster(source:Raster):Raster{
  const scale=Math.min(1,700/Math.max(source.width,source.height));
  if(scale===1)return source;
  const width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));
  const data=new Uint8ClampedArray(width*height*4);
  const sx=source.width/width, sy=source.height/height;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const top=y*sy,bottom=Math.min(source.height,(y+1)*sy);
    const left=x*sx,right=Math.min(source.width,(x+1)*sx);
    let red=0,green=0,blue=0;
    for(let yy=Math.floor(top);yy<bottom;yy++)for(let xx=Math.floor(left);xx<right;xx++){
      const area=(Math.min(right,xx+1)-Math.max(left,xx))*(Math.min(bottom,yy+1)-Math.max(top,yy));
      const i=4*(yy*source.width+xx);
      red+=area*source.data[i];green+=area*source.data[i+1];blue+=area*source.data[i+2];
    }
    const i=4*(y*width+x),area=(bottom-top)*(right-left);
    data[i]=red/area;data[i+1]=green/area;data[i+2]=blue/area;data[i+3]=255;
  }
  return {width,height,data};
}
