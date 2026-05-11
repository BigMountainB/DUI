// Dev server bootstrap: runs Vite (HTTPS) on port 3000 alongside a tiny
// HTTP-only listener on port 3080 that 301-redirects to the HTTPS URL.
//
// WHY: iPhone Safari / Chrome on a raw LAN IP default to http://, which
// hits Vite's HTTPS port and dies in the TLS handshake (empty response).
// The redirect on a separate port gives iOS a one-tap path to the real
// HTTPS URL — type http://192.168.86.24:3080, get bounced to
// https://192.168.86.24:3000.
import { createServer as createVite } from 'vite';
import { createServer as createHttp }  from 'http';

const HTTPS_PORT = 3000;
const REDIR_PORT = 3080;

const vite = await createVite({});
await vite.listen(HTTPS_PORT);
vite.printUrls();

createHttp((req, res) => {
  const host = (req.headers.host || '').split(':')[0] || 'localhost';
  const target = `https://${host}:${HTTPS_PORT}${req.url}`;
  res.writeHead(301, { Location: target });
  res.end(`Redirecting to ${target}`);
}).listen(REDIR_PORT, '0.0.0.0', () => {
  console.log(`  ➜  HTTP→HTTPS redirect on port ${REDIR_PORT}`);
  console.log(`     iPhone shortcut: http://<lan-ip>:${REDIR_PORT}`);
});
