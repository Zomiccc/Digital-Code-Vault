import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Card, Badge, Button, Table, Th, Td } from '@/components/ui';
import { ExchangeRatesCard } from '@/components/ExchangeRates';

/**
 * Currency settings on their own page. The dollar rate used to live inside the
 * Finance screen, where it was hard to find — and it is the one number that
 * drives both what a non-USD wallet is charged and what a regional price shows.
 */
export function CurrencyPage() {
  const { data: regions, isLoading } = useQuery({ queryKey: ['regions'], queryFn: () => api.listRegions() });
  const { data: rates } = useQuery({ queryKey: ['exchange-rates'], queryFn: api.listExchangeRates });

  const configured = new Set((rates || []).map((rate: any) => rate.currency));

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Currency & rates</h1>
        <p className="text-sm text-muted-foreground">
          Set what one US dollar is worth in each currency. This is the rate used when a wallet held
          in another currency is charged, and when a regional price is shown.
        </p>
      </div>

      <ExchangeRatesCard />

      <Card className="p-0">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">Currency used by each region</h2>
          <p className="text-sm text-muted-foreground">
            A region prices in this currency. Change it under Catalog → Regions. A region whose
            currency has no rate falls back to showing US dollars.
          </p>
        </div>
        {isLoading ? (
          <p role="status" className="p-4 text-muted-foreground">Loading regions...</p>
        ) : (
          <Table>
            <thead>
              <tr><Th>Region</Th><Th>Code</Th><Th>Currency</Th><Th>Rate set?</Th></tr>
            </thead>
            <tbody>
              {(regions || []).map((region: any) => (
                <RegionRateRow
                  key={region.id}
                  region={region}
                  ready={region.currency === 'USD' || configured.has(region.currency)}
                />
              ))}
              {(regions || []).length === 0 && (
                <tr>
                  <Td colSpan={4} className="py-12 text-center text-muted-foreground">
                    No regions yet. Add them under Catalog → Regions.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/**
 * A region's rate, set from the region itself.
 *
 * Typing the code by hand is how a rate ends up on "PAK" while the region uses
 * PKR, leaving it silently unmatched. Setting it from the region uses the
 * region's own code, so it cannot be mistyped.
 */
function RegionRateRow({ region, ready }: { region: any; ready: boolean }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => api.setExchangeRate(region.currency, Number(value)),
    onSuccess: () => {
      setError('');
      setValue('');
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
    },
    onError: (err: any) => setError(err.message),
  });

  const amount = Number(value);
  const valid = Number.isFinite(amount) && amount > 0;

  return (
    <tr className="hover:bg-muted/30">
      <Td className="font-medium">{region.name}</Td>
      <Td className="font-mono text-xs">{region.code}</Td>
      <Td>{region.symbol} {region.currency}</Td>
      <Td>
        {ready ? (
          <Badge className="bg-emerald-500/10 text-emerald-400">
            {region.currency === 'USD' ? 'base currency' : 'yes'}
          </Badge>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" step="0.0001"
                value={value}
                aria-label={`How many ${region.currency} per US dollar`}
                onChange={(e) => setValue(e.target.value)}
                placeholder={`${region.currency} per $1`}
                className="w-32 rounded border border-input bg-background px-2 py-1 text-sm"
              />
              <Button
                size="sm"
                disabled={!valid || save.isPending}
                onClick={() => save.mutate()}
              >
                Set rate
              </Button>
            </div>
            {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
          </div>
        )}
      </Td>
    </tr>
  );
}
