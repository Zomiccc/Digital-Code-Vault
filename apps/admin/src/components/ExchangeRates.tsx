import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Card, Button, Table, Th, Td, Input } from '@/components/ui';
import { formatDate } from '@/lib/utils';


/**
 * Every price in the platform is stored in USD. These rates are what the platform
 * converts with — both when charging a merchant wallet held in another currency
 * and when showing a regional price. A rate change applies to future orders only;
 * past orders keep the rate they were charged at.
 */
export function ExchangeRatesCard() {
  const queryClient = useQueryClient();
  const { data: rates, isLoading } = useQuery({ queryKey: ['exchange-rates'], queryFn: api.listExchangeRates });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newCurrency, setNewCurrency] = useState('');
  const [newRate, setNewRate] = useState('');
  const [error, setError] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
    queryClient.invalidateQueries({ queryKey: ['platform-finance-overview'] });
  };
  const save = useMutation({
    mutationFn: ({ currency, rate }: { currency: string; rate: number }) => api.setExchangeRate(currency, rate),
    onSuccess: (_d, vars) => {
      setDrafts((current) => { const next = { ...current }; delete next[vars.currency]; return next; });
      setNewCurrency(''); setNewRate(''); setError('');
      invalidate();
    },
    onError: (err: any) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: (currency: string) => api.deleteExchangeRate(currency),
    onSuccess: () => { setError(''); invalidate(); },
    onError: (err: any) => setError(err.message),
  });

  const codeIsValid = /^[A-Za-z]{3}$/.test(newCurrency.trim());
  const newRateValue = Number(newRate);
  const newRateIsValid = Number.isFinite(newRateValue) && newRateValue > 0;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Exchange rates</h2>
        <p className="text-sm text-muted-foreground">
          How many units of each currency one US dollar buys. Set PKR to 300 and a $100 code
          costs a PKR wallet 30,000.
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {isLoading && <p role="status" className="text-sm text-muted-foreground">Loading rates...</p>}

      <Table>
        <thead>
          <tr><Th>Currency</Th><Th>Units per $1</Th><Th>Last updated</Th><Th className="text-right">Actions</Th></tr>
        </thead>
        <tbody>
          {(rates || []).map((rate: any) => {
            const draft = drafts[rate.currency];
            const draftValue = Number(draft);
            const draftIsValid = draft !== undefined && Number.isFinite(draftValue) && draftValue > 0;
            return (
              <tr key={rate.currency}>
                <Td className="font-medium">
                  {rate.currency}
                  {rate.is_base && <span className="ml-2 text-xs text-muted-foreground">base currency</span>}
                </Td>
                <Td>
                  {rate.is_base ? (
                    <span className="text-muted-foreground">1.00</span>
                  ) : (
                    <input
                      type="number" min="0" step="0.0001"
                      aria-label={`Units of ${rate.currency} per US dollar`}
                      value={draft ?? String(rate.units_per_usd)}
                      onChange={(e) => setDrafts({ ...drafts, [rate.currency]: e.target.value })}
                      className="w-32 rounded border border-input bg-background px-2 py-1 text-sm"
                    />
                  )}
                </Td>
                <Td className="text-muted-foreground">{rate.updated_at ? formatDate(rate.updated_at) : '—'}</Td>
                <Td className="text-right">
                  {!rate.is_base && (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm" variant="outline"
                        disabled={!draftIsValid || save.isPending}
                        onClick={() => save.mutate({ currency: rate.currency, rate: draftValue })}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(rate.currency)}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
        <div className="w-32">
          <Input
            label="Add currency"
            value={newCurrency}
            onChange={(e: any) => setNewCurrency(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="TRY"
          />
        </div>
        <div className="w-40">
          <Input
            label="Units per $1"
            type="number" min="0" step="0.0001"
            value={newRate}
            onChange={(e: any) => setNewRate(e.target.value)}
            placeholder="34.20"
          />
        </div>
        <Button
          disabled={!codeIsValid || !newRateIsValid || save.isPending}
          onClick={() => save.mutate({ currency: newCurrency.trim().toUpperCase(), rate: newRateValue })}
        >
          Add rate
        </Button>
      </div>
    </Card>
  );
}
