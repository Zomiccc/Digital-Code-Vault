import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plug, ShoppingCart, Globe, Store, Loader2, Copy, Check, RefreshCw,
  AlertCircle, CheckCircle2, XCircle, Settings as SettingsIcon, Key,
  Webhook, FileText, ExternalLink, Download,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Badge, Input, Modal } from '@/components/ui';
import { formatDate } from '@/lib/utils';

type PlatformId = 'woocommerce' | 'shopify' | 'wordpress' | 'generic';

interface PlatformDef {
  id: PlatformId;
  name: string;
  description: string;
  icon: typeof ShoppingCart;
  color: string;
  instructions: string[];
  webhookHeaderName: string;
  pluginAvailable: boolean;
}

const PLATFORMS: PlatformDef[] = [
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    description: 'Connect your WooCommerce store to automatically fulfill digital code orders.',
    icon: ShoppingCart,
    color: '#7f54b3',
    pluginAvailable: true,
    webhookHeaderName: 'X-WC-Webhook-Source',
    instructions: [
      'Install the "DCV Webhook Connector" WordPress plugin on your store.',
      'Go to WooCommerce → DCV Webhook settings in your WordPress admin.',
      'Paste your API key (generate one from the API Keys page).',
      'Set the API Base URL to your platform URL (e.g. https://your-platform.com/api/v1).',
      'Paste your Webhook Secret (shown below) into the Webhook Secret field.',
      'Click "Register this site" to register your webhook endpoint.',
      'Configure your WooCommerce webhook to send events to the platform.',
    ],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Connect your Shopify store to automatically fulfill digital code orders.',
    icon: Store,
    color: '#95bf47',
    pluginAvailable: false,
    webhookHeaderName: 'X-Shopify-Topic',
    instructions: [
      'Go to your Shopify Admin → Settings → Notifications → Webhooks.',
      'Create a new webhook for "Order payment" (or "Order creation").',
      'Set the webhook URL to: https://your-platform.com/api/v1/webhooks/incoming',
      'Set the format to JSON.',
      'In the HTTP headers section, add a header: X-Webhook-Secret with your webhook secret (shown below).',
      'Save the webhook. Shopify will now send order events to the platform.',
      'Generate an API key from the API Keys page if you need programmatic access.',
    ],
  },
  {
    id: 'wordpress',
    name: 'WordPress (Non-WooCommerce)',
    description: 'Connect your WordPress site using the DCV Webhook Connector plugin.',
    icon: Globe,
    color: '#21759b',
    pluginAvailable: true,
    webhookHeaderName: 'X-Webhook-Secret',
    instructions: [
      'Download and install the "DCV Webhook Connector" WordPress plugin.',
      'Activate the plugin in your WordPress admin.',
      'Go to Settings → DCV Webhook.',
      'Paste your API key (generate one from the API Keys page).',
      'Set the API Base URL to your platform URL.',
      'Paste your Webhook Secret (shown below) into the Webhook Secret field.',
      'Click "Register this site" to complete the connection.',
    ],
  },
  {
    id: 'generic',
    name: 'Custom / Generic Platform',
    description: 'Connect any custom e-commerce platform via our webhook API.',
    icon: Plug,
    color: '#6366f1',
    pluginAvailable: false,
    webhookHeaderName: 'X-Webhook-Secret',
    instructions: [
      'Configure your platform to send POST requests to: https://your-platform.com/api/v1/webhooks/incoming',
      'Include the header X-Webhook-Secret with your webhook secret (shown below).',
      'Send order data in JSON format with fields: order_id, product_id, amount, customer_email, etc.',
      'Generate an API key from the API Keys page for programmatic API access.',
      'Use the Webhook SDK (npm install @codevault/webhook-sdk) for request signing.',
    ],
  },
];

export function MerchantIntegrationsPage() {
  const queryClient = useQueryClient();
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformDef | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: webhookSecretData, isLoading: secretLoading } = useQuery({
    queryKey: ['webhook-secret'],
    queryFn: api.getWebhookSecret,
  });

  const { data: stats } = useQuery({
    queryKey: ['webhook-statistics'],
    queryFn: api.getWebhookStatistics,
  });

  const { data: incomingWebhooks } = useQuery({
    queryKey: ['incoming-webhooks'],
    queryFn: api.listIncomingWebhooks,
  });

  const { data: connectedProducts } = useQuery({
    queryKey: ['connected-products'],
    queryFn: api.listConnectedProducts,
  });

  const regenerateSecretMutation = useMutation({
    mutationFn: api.regenerateWebhookSecret,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-secret'] });
    },
  });

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const getPlatformStatus = (platformId: string): 'connected' | 'not_connected' | 'config_required' | 'error' => {
    if (!webhookSecretData?.webhook_secret) return 'config_required';

    const platformWebhooks = Array.isArray(incomingWebhooks)
      ? incomingWebhooks.filter((w: any) => w.platform?.toLowerCase() === platformId)
      : [];

    if (platformWebhooks.length === 0) return 'not_connected';

    const hasErrors = platformWebhooks.some((w: any) => w.processingStatus === 'FAILED');
    const hasCompleted = platformWebhooks.some((w: any) => w.processingStatus === 'COMPLETED');

    if (hasErrors && !hasCompleted) return 'error';
    if (hasCompleted) return 'connected';
    return 'not_connected';
  };

  const getPlatformProductCount = (platformId: string): number => {
    if (!Array.isArray(connectedProducts)) return 0;
    return connectedProducts.filter((p: any) => p.platform?.toLowerCase() === platformId).length;
  };

  const getPlatformWebhookCount = (platformId: string): number => {
    if (!Array.isArray(incomingWebhooks)) return 0;
    return incomingWebhooks.filter((w: any) => w.platform?.toLowerCase() === platformId).length;
  };

  const statusConfig = {
    connected: { label: 'Connected', color: 'bg-emerald-500/20 text-emerald-400', icon: CheckCircle2 },
    not_connected: { label: 'Not Connected', color: 'bg-muted text-muted-foreground', icon: XCircle },
    config_required: { label: 'Configuration Required', color: 'bg-amber-500/20 text-amber-400', icon: AlertCircle },
    error: { label: 'Error', color: 'bg-red-500/20 text-red-400', icon: AlertCircle },
  };

  const webhookUrl = `${window.location.origin}/api/v1/webhooks/incoming`;

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect your external e-commerce platform to automatically fulfill digital code orders
        </p>
      </div>

      {/* Webhook Secret Section */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <Key className="h-5 w-5" /> Webhook Secret
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Use this secret to authenticate incoming webhooks from your external platform
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => regenerateSecretMutation.mutate()}
            disabled={regenerateSecretMutation.isPending}
          >
            {regenerateSecretMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Regenerate
          </Button>
        </div>
        <div className="rounded-lg bg-muted/50 p-4">
          {secretLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-sm break-all">
                {showSecret
                  ? webhookSecretData?.webhook_secret
                  : '••••••••••••••••••••••••••••••••'}
              </code>
              <Button variant="ghost" size="sm" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? 'Hide' : 'Show'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(webhookSecretData?.webhook_secret || '', 'secret')}
              >
                {copied === 'secret' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Send this secret in the <code className="text-foreground">X-Webhook-Secret</code> header with each webhook request from your platform.
          </p>
        </div>
      </Card>

      {/* Webhook Endpoint URL */}
      <Card>
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2 mb-3">
          <Webhook className="h-5 w-5" /> Webhook Endpoint
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Configure your external platform to send webhook events to this URL
        </p>
        <div className="rounded-lg bg-muted/50 p-4">
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm break-all">{webhookUrl}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(webhookUrl, 'url')}
            >
              {copied === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>

      {/* Platform Integration Cards */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Supported Platforms</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PLATFORMS.map((platform) => {
            const status = getPlatformStatus(platform.id);
            const statusCfg = statusConfig[status];
            const productCount = getPlatformProductCount(platform.id);
            const webhookCount = getPlatformWebhookCount(platform.id);
            const Icon = platform.icon;
            const StatusIcon = statusCfg.icon;

            return (
              <Card key={platform.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${platform.color}20`, color: platform.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{platform.name}</h3>
                      <p className="text-xs text-muted-foreground">{platform.description}</p>
                    </div>
                  </div>
                  <Badge className={statusCfg.color}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {statusCfg.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                  <div className="rounded-lg bg-muted/30 p-2">
                    <div className="text-xs text-muted-foreground">Webhooks Received</div>
                    <div className="font-semibold">{webhookCount}</div>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-2">
                    <div className="text-xs text-muted-foreground">Connected Products</div>
                    <div className="font-semibold">{productCount}</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPlatform(platform)}
                  >
                    <SettingsIcon className="h-4 w-4 mr-1" />
                    Configure
                  </Button>
                  {platform.pluginAvailable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        window.open('/connectors/wp-dcv-webhook/README.md', '_blank');
                      }}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Plugin Guide
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Quick Links */}
      <Card>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Quick Links</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <a
            href="/merchant/api-keys"
            className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
          >
            <Key className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">API Keys</div>
              <div className="text-xs text-muted-foreground">Generate keys for API access</div>
            </div>
            <ExternalLink className="ml-auto h-4 w-4 text-muted-foreground" />
          </a>
          <a
            href="/merchant/incoming-webhooks"
            className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
          >
            <Webhook className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Incoming Webhooks</div>
              <div className="text-xs text-muted-foreground">View webhook events from platforms</div>
            </div>
            <ExternalLink className="ml-auto h-4 w-4 text-muted-foreground" />
          </a>
          <a
            href="/merchant/connected-products"
            className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
          >
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Connected Products</div>
              <div className="text-xs text-muted-foreground">View synced products</div>
            </div>
            <ExternalLink className="ml-auto h-4 w-4 text-muted-foreground" />
          </a>
        </div>
      </Card>

      {/* Configuration Modal */}
      <Modal
        open={!!selectedPlatform}
        onClose={() => setSelectedPlatform(null)}
        title={selectedPlatform ? `${selectedPlatform.name} Integration` : ''}
      >
        {selectedPlatform && (
          <div className="space-y-4">
            {/* Status */}
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Connection Status</span>
                <Badge className={statusConfig[getPlatformStatus(selectedPlatform.id)].color}>
                  {statusConfig[getPlatformStatus(selectedPlatform.id)].label}
                </Badge>
              </div>
            </div>

            {/* Webhook Secret */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Your Webhook Secret
              </label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Paste this into the {selectedPlatform.webhookHeaderName} header in your {selectedPlatform.name} webhook configuration.
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                <code className="flex-1 font-mono text-sm break-all">
                  {showSecret
                    ? webhookSecretData?.webhook_secret
                    : '••••••••••••••••••••••••••••••••'}
                </code>
                <Button variant="ghost" size="sm" onClick={() => setShowSecret(!showSecret)}>
                  {showSecret ? 'Hide' : 'Show'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(webhookSecretData?.webhook_secret || '', 'modal-secret')}
                >
                  {copied === 'modal-secret' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Webhook URL */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Webhook URL
              </label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Configure your {selectedPlatform.name} store to send webhooks to this URL.
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                <code className="flex-1 font-mono text-sm break-all">{webhookUrl}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(webhookUrl, 'modal-url')}
                >
                  {copied === 'modal-url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Instructions */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Setup Instructions
              </label>
              <ol className="mt-2 space-y-2">
                {selectedPlatform.instructions.map((step, idx) => (
                  <li key={idx} className="flex gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {idx + 1}
                    </span>
                    <span className="text-muted-foreground pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Plugin link */}
            {selectedPlatform.pluginAvailable && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">WordPress Plugin Available</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Download the DCV Webhook Connector plugin from the connectors directory.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    window.open('/connectors/wp-dcv-webhook/README.md', '_blank');
                  }}
                >
                  View Plugin Guide
                </Button>
              </div>
            )}

            {/* Recent webhooks from this platform */}
            {Array.isArray(incomingWebhooks) && incomingWebhooks.filter(
              (w: any) => w.platform?.toLowerCase() === selectedPlatform.id
            ).length > 0 && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent Webhooks from {selectedPlatform.name}
                </label>
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {incomingWebhooks
                    .filter((w: any) => w.platform?.toLowerCase() === selectedPlatform.id)
                    .slice(0, 5)
                    .map((w: any) => (
                      <div key={w.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs">
                        <span className="font-mono text-muted-foreground">{w.eventId?.slice(0, 16) || '—'}...</span>
                        <Badge className={
                          w.processingStatus === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                          w.processingStatus === 'FAILED' ? 'bg-red-500/20 text-red-400' :
                          'bg-muted text-muted-foreground'
                        }>
                          {w.processingStatus}
                        </Badge>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSelectedPlatform(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
