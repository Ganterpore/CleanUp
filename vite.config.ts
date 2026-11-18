import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Serves the Vercel functions in /api during `npm run dev`, so sync works
 * locally without `vercel dev`. Without Upstash env vars it uses an
 * in-memory store; the password defaults to "dev" unless CLEANUP_PASSWORD
 * is set in .env.local.
 */
function devApi(): Plugin {
  return {
    name: 'cleanup-dev-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const [k, v] of Object.entries(env)) process.env[k] ??= v;
      process.env.CLEANUP_PASSWORD ??= 'dev';

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const name = url.pathname.slice('/api/'.length).replace(/\/$/, '');
        if (!/^[a-z-]+$/.test(name)) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const handler = mod[req.method ?? 'GET'] as ((r: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const response = await handler(
            new Request(url.href, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined }),
          );
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.config.logger.error(String((err as Error).stack ?? err));
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'server_error' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
});
