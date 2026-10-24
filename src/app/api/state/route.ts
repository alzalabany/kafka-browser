import { getState, setState } from '@/lib/db';
export const runtime = 'nodejs';
export async function GET(request: Request) { return Response.json(getState(new URL(request.url).searchParams.get('key') || 'app')); }
export async function PUT(request: Request) { const { key, value } = await request.json(); if (typeof key !== 'string' || !value || typeof value !== 'object') return Response.json({error:'Invalid state'}, {status:400}); setState(key, value); return Response.json({ok:true}); }
