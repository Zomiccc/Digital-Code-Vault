import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Table, Th, Td } from '@/components/ui';
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
              {(regions || []).map((region: any) => {
                const ready = region.currency === 'USD' || configured.has(region.currency);
                return (
                  <tr key={region.id} className="hover:bg-muted/30">
                    <Td className="font-medium">{region.name}</Td>
                    <Td className="font-mono text-xs">{region.code}</Td>
                    <Td>{region.symbol} {region.currency}</Td>
                    <Td>
                      <Badge className={ready ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-500'}>
                        {region.currency === 'USD' ? 'base currency' : ready ? 'yes' : 'no rate yet'}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
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
