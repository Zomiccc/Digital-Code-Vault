import { Response } from 'express';
export declare class PluginDownloadService {
    private readonly logger;
    private readonly pluginSourcePath;
    constructor();
    downloadPlugin(res: Response): Promise<void>;
}
