/** Cloudflare Worker entry point. */
import { createApp, refreshLiveNews } from './app';
import { createDeps, type AppDeps } from './deps';
import type { Env } from './env';

let cached: { env: Env; deps: AppDeps } | null = null;

function depsFor(env: Env): AppDeps {
  if (!cached || cached.env !== env) cached = { env, deps: createDeps(env) };
  return cached.deps;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const app = createApp(depsFor(env), { defer: (p) => ctx.waitUntil(p.catch((e: unknown) => console.error('[deferred]', e))) });
    return app.fetch(request, env, ctx);
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshLiveNews(depsFor(env), true));
  },
} satisfies ExportedHandler<Env>;
