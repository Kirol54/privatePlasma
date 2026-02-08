/**
 * Proof generation proxy server.
 *
 * Bridges the browser frontend to the Rust SP1 prover binary.
 * The prover requires subprocess execution (cargo run) which can't run in browsers.
 *
 * Routes:
 *   POST /prove/transfer  — Generate a transfer proof
 *   POST /prove/withdraw  — Generate a withdraw proof
 *   GET  /health          — Health check
 */

import express from 'express';
import cors from 'cors';
import https from 'https';
import { execFile } from 'child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3001;
const PROJECT_DIR = process.env.PROJECT_DIR || join(import.meta.dirname, '..');

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Run the Rust prover binary for a given circuit.
 */
async function runProver(circuit: string, inputJson: string): Promise<{ proof: string; publicValues: string; vkey: string }> {
  const tempDir = mkdtempSync(join(tmpdir(), 'shielded-pool-'));
  const inputPath = join(tempDir, 'input.json');
  const outputPath = join(tempDir, 'output.json');

  try {
    writeFileSync(inputPath, inputJson);

    const args = [
      'run', '--release', '-p', 'shielded-pool-script', '--bin', 'shielded-pool-script', '--',
      circuit,
      '--input', inputPath,
      '--output', outputPath,
    ];

    console.log(`[${circuit}] Starting proof generation...`);
    const { stdout, stderr } = await execFileAsync('cargo', args, {
      cwd: PROJECT_DIR,
      timeout: 600_000, // 10 minutes
      maxBuffer: 50 * 1024 * 1024, // 50MB for large proof output logs
      env: { ...process.env },
    });

    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

    const output = JSON.parse(readFileSync(outputPath, 'utf-8'));
    console.log(`[${circuit}] Proof generated successfully.`);

    // Rust hex::encode outputs without 0x prefix; ethers needs 0x-prefixed hex
    const ensure0x = (s: string) => s.startsWith('0x') ? s : `0x${s}`;

    return {
      proof: ensure0x(output.proof),
      publicValues: ensure0x(output.public_values),
      vkey: ensure0x(output.vkey),
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

app.post('/prove/transfer', async (req, res) => {
  try {
    const result = await runProver('transfer', JSON.stringify(req.body));
    res.json(result);
  } catch (err: any) {
    console.error('[transfer] Proof generation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/prove/withdraw', async (req, res) => {
  try {
    const result = await runProver('withdraw', JSON.stringify(req.body));
    res.json(result);
  } catch (err: any) {
    console.error('[withdraw] Proof generation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Try HTTPS (needed when frontend is served from a remote HTTPS origin like Netlify)
const certPath = join(import.meta.dirname, 'localhost+2.pem');
const keyPath = join(import.meta.dirname, 'localhost+2-key.pem');

if (existsSync(certPath) && existsSync(keyPath)) {
  const httpsPort = Number(process.env.HTTPS_PORT || 3443);
  https.createServer({
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  }, app).listen(httpsPort, () => {
    console.log(`\nShielded Pool Proxy running on:`);
    console.log(`  HTTP  → http://localhost:${PORT}`);
    console.log(`  HTTPS → https://localhost:${httpsPort}`);
    console.log(`Project dir: ${PROJECT_DIR}`);
    console.log(`SP1_PROVER: ${process.env.SP1_PROVER || 'not set'}\n`);
  });

  // Also keep HTTP for local dev
  app.listen(PORT);
} else {
  app.listen(PORT, () => {
    console.log(`\nShielded Pool Proxy running on http://localhost:${PORT}`);
    console.log(`Project dir: ${PROJECT_DIR}`);
    console.log(`SP1_PROVER: ${process.env.SP1_PROVER || 'not set'}`);
    console.log(`\nTip: To use with HTTPS frontends (e.g. Netlify), run:`);
    console.log(`  brew install mkcert && mkcert -install && cd proxy && mkcert localhost 127.0.0.1 ::1\n`);
  });
}
