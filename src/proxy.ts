/**
 * A small HTTP proxy that sits on the suite's base URL in front of Novera's
 * production server and can misbehave in controlled ways: answer with a
 * status code, delay responses, or delay only the first page load's scripts.
 *
 * Run as a child process: `tsx src/proxy.ts '<ProxyConfig JSON>'`. Prints
 * "listening" once it accepts connections.
 */
import http from 'node:http';

export interface ProxyRule {
  /** Regex on the request path (including query). Omitted matches every path. */
  path?: string;
  /** Matches the Sec-Fetch-Dest header, e.g. "document" or "script". */
  dest?: string;
  /** Only while the browser is on its first page load of this proxy's life. */
  firstPageLoadOnly?: boolean;
  /** Answer with this status and body instead of forwarding. */
  status?: number;
  body?: string;
  /** Hold the forwarded response this long. */
  delayMs?: number;
}

export interface ProxyConfig {
  listenPort: number;
  /** Where healthy requests go. */
  upstreamPort: number;
  rules: ProxyRule[];
}

export function startProxy(config: ProxyConfig): Promise<http.Server> {
  let documents = 0;

  const server = http.createServer((req, res) => {
    const path = req.url ?? '/';
    const dest = String(req.headers['sec-fetch-dest'] ?? '');
    if (dest === 'document') documents += 1;

    const rule = config.rules.find(
      (r) =>
        (!r.path || new RegExp(r.path).test(path)) &&
        (!r.dest || r.dest === dest) &&
        (!r.firstPageLoadOnly || documents <= 1),
    );

    if (rule?.status) {
      const body = rule.body ?? http.STATUS_CODES[rule.status] ?? '';
      res.writeHead(rule.status, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }

    const forward = () => {
      const upstream = http.request(
        { host: '127.0.0.1', port: config.upstreamPort, path, method: req.method, headers: req.headers },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    };

    if (rule?.delayMs) {
      const timer = setTimeout(forward, rule.delayMs);
      res.on('close', () => clearTimeout(timer));
    } else {
      forward();
    }
  });

  return new Promise((resolve) => server.listen(config.listenPort, () => resolve(server)));
}

/** A server on the wrong port: something else answers, with a generic 404. */
export function startStranger(port: number): Promise<http.Server> {
  const body =
    '<!doctype html><html><head><title>404 Not Found</title></head><body><h1>Not Found</h1>' +
    '<p>The requested URL was not found on this server.</p></body></html>';
  const server = http.createServer((_req, res) => {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1]?.endsWith('proxy.ts') && process.argv[2]) {
  const arg = JSON.parse(process.argv[2]) as ProxyConfig | { stranger: number };
  const started = 'stranger' in arg ? startStranger(arg.stranger) : startProxy(arg);
  started.then(() => console.log('listening'));
}
