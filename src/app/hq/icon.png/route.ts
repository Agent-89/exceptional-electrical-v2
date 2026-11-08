import {readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
export const runtime='nodejs';
export async function GET(){
 const source=await readFile(path.join(process.cwd(),'public','exceptional-electrical-logo.png'));
 const meta=await sharp(source).metadata();
 const width=meta.width||512,height=meta.height||512;
 // Focus on the blue plug and its short cable, excluding the horizontal wordmark.
 const cropWidth=Math.max(1,Math.round(width*0.205));
 const plug=await sharp(source).extract({left:0,top:0,width:Math.min(width,cropWidth),height}).flatten({background:'#ffffff'}).trim({background:'#ffffff',threshold:18}).png().toBuffer();
 const png=await sharp(plug).resize(450,450,{fit:'contain',background:'#ffffff'}).extend({top:31,bottom:31,left:31,right:31,background:'#ffffff'}).png().toBuffer();
 return new Response(new Uint8Array(png),{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=3600'}});
}
