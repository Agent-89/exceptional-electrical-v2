import {readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
export const runtime='nodejs';
export async function GET(){
 const source=await readFile(path.join(process.cwd(),'public','exceptional-electrical-logo.png'));
 const meta=await sharp(source).metadata();
 const width=meta.width||512,height=meta.height||512;
 // Crop around the plug head and short cable, not the long wordmark/cable tail.
 // The previous 20.5% crop cut off the plug prongs.
 const cropWidth=Math.min(width,Math.max(1,Math.round(width*0.255)));
 const cropHeight=Math.min(height,Math.max(1,Math.round(height*0.78)));
 const plug=await sharp(source)
  .extract({left:0,top:0,width:cropWidth,height:cropHeight})
  .flatten({background:'#ffffff'})
  .trim({background:'#ffffff',threshold:16})
  .png().toBuffer();
 const png=await sharp(plug)
  .resize(456,456,{fit:'contain',background:'#ffffff'})
  .extend({top:28,bottom:28,left:28,right:28,background:'#ffffff'})
  .png().toBuffer();
 return new Response(new Uint8Array(png),{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=3600'}});
}
