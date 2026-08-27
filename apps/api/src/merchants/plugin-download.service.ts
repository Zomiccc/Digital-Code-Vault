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
    const parentDir = path.resolve(__dirname, '..');
    const grandParentDir = path.resolve(parentDir, '..');

    this.zipCandidates = [
      // 1. Copied into apps/api/dist/ by deploy-build.sh (most reliable on Hostinger)
      path.resolve(__dirname, 'dcv-webhook-plugin.zip'),
      // 2. Hostinger create-launcher layout: dist/public/merchant/
      path.resolve(__dirname, 'public', 'merchant', 'dcv-webhook-plugin.zip'),
      // 3. apps/merchant/public/ relative to apps/api/dist/.. = apps/api/../merchant = wrong
      //    relative to apps/api/dist/../.. = apps/merchant — correct for standard layout
      path.resolve(grandParentDir, 'merchant', 'public', 'dcv-webhook-plugin.zip'),
      // 4. Relative to process.cwd() (Hostinger cwd = repo root or nodejs/)
      path.resolve(process.cwd(), 'apps', 'merchant', 'public', 'dcv-webhook-plugin.zip'),
      // 5. Relative to process.cwd() without apps/ prefix
      path.resolve(process.cwd(), 'merchant', 'public', 'dcv-webhook-plugin.zip'),
    ];

    this.sourceCandidates = [
      // Local dev: project root / connectors / wp-dcv-webhook
      path.resolve(parentDir, '..', '..', 'connectors', 'wp-dcv-webhook'),
      // Hostinger fallback: dist/connectors/wp-dcv-webhook
      path.resolve(__dirname, 'connectors', 'wp-dcv-webhook'),
    ];

    const zipFound = this.zipCandidates.find((p) => fs.existsSync(p));
    const srcFound = this.sourceCandidates.find((p) => fs.existsSync(p));
    if (!zipFound && !srcFound) {
      this.logger.warn('WordPress plugin ZIP and source directory not found in any candidate path.');
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
    this.logger.error('Plugin ZIP not found in any location.');
    res.status(404).json({
      error: 'PLUGIN_NOT_FOUND',
      message: 'WordPress plugin is not available on this server.',
    });
  }
}
