import {readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
export const runtime='nodejs';
export async function GET(){
 const source=await readFile(path.join(process.cwd(),'public','exceptional-electrical-logo.png'));
 const image=sharp(source);const meta=await image.metadata();
 const width=meta.width||512,height=meta.height||512;
 // Isolate the plug symbol at the left of the horizontal Exceptional Electrical wordmark.
 const left=0,top=0,cropWidth=Math.max(1,Math.round(width*0.28));
 const extracted=await image.extract({left,top,width:Math.min(width,cropWidth),height});
 const png=await extracted.resize(420,420,{fit:'contain',background:'#ffffff'}).extend({top:46,bottom:46,left:46,right:46,background:'#ffffff'}).png().toBuffer();
 return new Response(new Uint8Array(png),{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=86400'}});
}
