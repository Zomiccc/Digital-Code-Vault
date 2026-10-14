import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';

/**
 * Keep the host's captured stdout file from filling the disk.
 *
 * Hostinger writes everything this process prints to `nodejs/console.log`, next
 * to the `dist/` directory, and never rotates it. It reached 107 GB of a 100 GB
 * plan twice; once the disk is full every request is answered with a 503 and
 * the platform goes dark until someone empties the file by hand over SSH.
 *
 * Quieter logging lowers the rate, but nothing else puts a ceiling on the file,
 * so this does: when it passes the limit it is truncated in place. The host
 * opens it in append mode — truncating it over SSH left the running process
 * writing from the start again, not at its old offset — so emptying it in
 * place is safe and frees the space at once, where deleting it would not until
 * the process restarted.
 */
const CHECK_EVERY_MS = 10 * 60 * 1000;
const DEFAULT_MAX_MB = 200;

function candidateFiles(): string[] {
  const files = [
    path.resolve(process.cwd(), 'console.log'),
    path.resolve(__dirname, '..', 'console.log'),
    path.resolve(__dirname, '..', '..', 'console.log'),
  ];
  return [...new Set(files)];
}

export function startLogSizeGuard(): void {
  const maxMb = Number(process.env.LOG_FILE_MAX_MB) || DEFAULT_MAX_MB;
  const maxBytes = maxMb * 1024 * 1024;
  const logger = new Logger('LogSizeGuard');

  const check = () => {
    for (const file of candidateFiles()) {
      try {
        const { size } = fs.statSync(file);
        if (size <= maxBytes) continue;
        fs.truncateSync(file, 0);
        logger.warn(
          `${file} reached ${(size / 1024 / 1024).toFixed(0)} MB (limit ${maxMb} MB) — emptied it to keep the disk from filling`,
        );
      } catch {
        // Not there (local dev, other hosts) or not ours to touch — nothing to do.
      }
    }
  };

  check();
  setInterval(check, CHECK_EVERY_MS).unref();
}
