import {db} from '@/lib/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET() {
  try {
    db.prepare('SELECT 1').get();
    return Response.json({status:'ok'});
  } catch {
    return Response.json({status:'unhealthy'},{status:503});
  }
}
