import { AsyncLocalStorage } from 'node:async_hooks';
export const timing = new AsyncLocalStorage<{ dbMs: number; queries: number }>();
export async function traceDb<T>(action: () => Promise<T>): Promise<T> { const start=performance.now(); try { return await action(); } finally { const context=timing.getStore(); if(context){context.dbMs+=performance.now()-start;context.queries++;} } }
export async function timedResponse(action: () => Promise<Response>): Promise<Response> {
  const metrics={dbMs:0,queries:0}; const start=performance.now();
  return timing.run(metrics,async()=>{ const response=await action(); const total=performance.now()-start; response.headers.set('Server-Timing',`total;dur=${total.toFixed(1)}, db;dur=${metrics.dbMs.toFixed(1)}, queries;desc="${metrics.queries}"`); if(process.env.NODE_ENV==='development'&&process.env.GAME_TIMING==='1') console.info('[game timing]',{ms:Math.round(total),dbMs:Math.round(metrics.dbMs),queries:metrics.queries}); return response; });
}
