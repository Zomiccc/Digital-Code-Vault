import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Response } from 'express';

@Injectable()
export class PluginDownloadService {
  private readonly logger = new Logger(PluginDownloadService.name);

  // Candidate paths for a pre-built ZIP (checked in order).
  private readonly zipCandidates: string[];
  // Candidate paths for the raw plugin source directory (for on-the-fly archive).
  private readonly sourceCandidates: string[];

  constructor() {
    const distDir = path.resolve(__dirname, '..');       // apps/api/dist
    const apiDir = path.resolve(distDir, '..');          // apps/api
    const repoRoot = path.resolve(apiDir, '..', '..');   // repo root

    // Ordered by how much they can be relied on. The first two are relative to
    // this file, so they hold wherever the process is started from; the rest
    // depend on the surrounding layout and are only a convenience for local runs.
    //
    // Every candidate used to be layout-dependent, and in production none of
    // them existed — which is why the download answered "not available" while
    // the ZIP sat happily in the repository. deploy-build.sh now writes the ZIP
    // next to this file, so candidate 1 is the one that actually serves it.
    this.zipCandidates = [
      path.resolve(__dirname, 'dcv-webhook-plugin.zip'),
      path.resolve(distDir, 'dcv-webhook-plugin.zip'),
      path.resolve(distDir, 'public', 'merchant', 'dcv-webhook-plugin.zip'),
      path.resolve(repoRoot, 'apps', 'merchant', 'public', 'dcv-webhook-plugin.zip'),
      path.resolve(repoRoot, 'dist', 'public', 'merchant', 'dcv-webhook-plugin.zip'),
      path.resolve(process.cwd(), 'apps', 'merchant', 'public', 'dcv-webhook-plugin.zip'),
      path.resolve(process.cwd(), 'dist', 'public', 'merchant', 'dcv-webhook-plugin.zip'),
    ];

    // Building the archive from source is the backstop, so a missing ZIP can
    // never make the download unavailable. The previous repo-root path was off
    // by a directory, so this never fired either.
    this.sourceCandidates = [
      path.resolve(__dirname, 'connectors', 'wp-dcv-webhook'),
      path.resolve(distDir, 'connectors', 'wp-dcv-webhook'),
      path.resolve(repoRoot, 'connectors', 'wp-dcv-webhook'),
      path.resolve(process.cwd(), 'connectors', 'wp-dcv-webhook'),
    ];

    const zipFound = this.zipCandidates.find((candidate) => fs.existsSync(candidate));
    const srcFound = this.sourceCandidates.find((candidate) => fs.existsSync(candidate));
    if (zipFound) {
      this.logger.log(`WordPress plugin ZIP available at ${zipFound}`);
    } else if (srcFound) {
      this.logger.log(`WordPress plugin will be archived on demand from ${srcFound}`);
    } else {
      // Loud, because the merchant-facing symptom is a download that just fails.
      this.logger.error(
        'WordPress plugin not found as a ZIP or as source. Checked ZIPs: ' +
        `${this.zipCandidates.join(', ')} | sources: ${this.sourceCandidates.join(', ')}`,
      );
    }
  }

  async downloadPlugin(res: Response): Promise<void> {
    // 1. Try serving a pre-built ZIP file (fastest, works on Hostinger).
    const zipPath = this.zipCandidates.find((p) => fs.existsSync(p));
    if (zipPath) {
      this.logger.log(`Serving pre-built plugin ZIP from: ${zipPath}`);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="wp-dcv-webhook.zip"');
      const stream = fs.createReadStream(zipPath);
      stream.pipe(res);
      stream.on('error', (err: Error) => {
        this.logger.error(`Stream error: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'STREAM_ERROR', message: 'Failed to stream plugin ZIP.' });
        }
      });
      return;
    }

    // 2. Fall back to archiving from the source directory (local dev).
    const sourcePath = this.sourceCandidates.find((p) => fs.existsSync(p));
    if (sourcePath) {
      const archiver = require('archiver');
      this.logger.log(`Archiving plugin from source: ${sourcePath}`);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="wp-dcv-webhook.zip"');
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err: Error) => {
        this.logger.error(`Archive error: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'ARCHIVE_ERROR', message: 'Failed to create plugin ZIP archive.' });
        }
      });
      archive.pipe(res);
      archive.directory(sourcePath, 'wp-dcv-webhook');
      await archive.finalize();
      this.logger.log('WordPress plugin ZIP served from source.');
      return;
    }

    // 3. Nothing found.
    this.logger.error(
      'Plugin ZIP not found in any location. Checked: ' +
      `${this.zipCandidates.join(', ')} | sources: ${this.sourceCandidates.join(', ')}`,
    );
    res.status(404).json({
      error: 'PLUGIN_NOT_FOUND',
      message: 'WordPress plugin is not available on this server.',
    });
  }
}
