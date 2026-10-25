import { hosted, requireHostedConfig } from '@/lib/hosted-config';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() {
  try {
    if (hosted()) requireHostedConfig();
    else { const {db}=await import('@/lib/db'); db.prepare('SELECT 1').get(); }
    return Response.json({status:'ok'});
  } catch { return Response.json({status:'unhealthy'},{status:503}); }
}
