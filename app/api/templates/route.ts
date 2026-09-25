import {authorize,jsonError} from '@/lib/db';
import templates from '@/lib/data/templates.json';
export async function GET(req:Request){try{authorize(req);const kind=new URL(req.url).searchParams.get('kind');if(kind!=='claim'&&kind!=='bundle')return new Response('Not found',{status:404});return Response.json({base64:templates[kind]},{headers:{'Cache-Control':'private, no-store'}})}catch(e){return jsonError(e)}}
