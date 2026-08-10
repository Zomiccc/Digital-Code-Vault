import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Response } from 'express';

// archiver v5 — callable function
const archiver = require('archiver');

@Injectable()
export class PluginDownloadService {
  private readonly logger = new Logger(PluginDownloadService.name);
  private readonly pluginSourcePath: string;

  constructor() {
    // Resolve the connectors/wp-dcv-webhook directory relative to the project root
    // From apps/api/dist → ../../../../connectors/wp-dcv-webhook
    // From apps/api/src → ../../../../connectors/wp-dcv-webhook
    this.pluginSourcePath = path.resolve(
      process.cwd(),
      '..',
      '..',
      'connectors',
      'wp-dcv-webhook',
    );

    if (!fs.existsSync(this.pluginSourcePath)) {
      this.logger.warn(`Plugin source not found at: ${this.pluginSourcePath}`);
    }
  }

  async downloadPlugin(res: Response): Promise<void> {
    const pluginDir = this.pluginSourcePath;

    if (!fs.existsSync(pluginDir)) {
      this.logger.error(`Plugin source directory not found: ${pluginDir}`);
      res.status(404).json({
        error: 'PLUGIN_NOT_FOUND',
        message: 'WordPress plugin source is not available on this server.',
      });
      return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="wp-dcv-webhook.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err: Error) => {
      this.logger.error(`Archive error: ${err.message}`);
      res.status(500).json({
        error: 'ARCHIVE_ERROR',
        message: 'Failed to create plugin ZIP archive.',
      });
    });

    archive.pipe(res);

    // Add all files from the plugin directory, preserving structure inside wp-dcv-webhook/
    archive.directory(pluginDir, 'wp-dcv-webhook');

    await archive.finalize();
    this.logger.log('WordPress plugin ZIP served: wp-dcv-webhook.zip');
  }
}
