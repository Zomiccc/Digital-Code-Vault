import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface DenominationStock {
  denominationId: string;
  faceValue: number;
  availableCount: number;
}

export interface AllocationResult {
  denominationId: string;
  faceValue: number;
  codeItemIds: string[];
}

@Injectable()
export class AllocationEngineService {
  private readonly logger = new Logger(AllocationEngineService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * The cheapest way to hand over exactly `targetAmount` from the codes in stock.
   *
   * "Cheapest" means fewest codes: a $150 order takes one $150 code if there is
   * one, then $100 + $50, and only then fifteen $10s. Every combination that
   * sums exactly is fair game — this is the whole reason an order for a value
   * with no code of its own can still be filled.
   *
   * Returns null only when no combination of the available codes sums exactly.
   */
  findBestCombination(
    denominations: DenominationStock[],
    targetAmount: number,
  ): { denominationId: string; faceValue: number; count: number }[] | null {
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      return null;
    }

    const stock = denominations
      .filter((d) => d.availableCount > 0 && d.faceValue > 0 && Number.isFinite(d.faceValue))
      .sort((a, b) => b.faceValue - a.faceValue);

    if (stock.length === 0) {
      return null;
    }

    // All arithmetic below is in whole cents. Face values carry two decimals,
    // and adding them as floats made sums that are exactly right on paper come
    // out a fraction off — 1.10 + 2.20 is not 3.30 in binary — so an order that
    // could be filled was refused for a rounding error.
    const target = AllocationEngineService.toCents(targetAmount);
    const values = stock.map((d) => AllocationEngineService.toCents(d.faceValue));

    // A single code of exactly the right value: nothing beats one code.
    for (let i = 0; i < stock.length; i++) {
      if (values[i] === target) {
        return [{ denominationId: stock[i].denominationId, faceValue: stock[i].faceValue, count: 1 }];
      }
    }

    return this.fewestCodesForTarget(stock, values, target);
  }

  private static toCents(amount: number): number {
    return Math.round(amount * 100);
  }

  private static gcd(a: number, b: number): number {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
      const t = x % y;
      x = y;
      y = t;
    }
    return x;
  }

  /**
   * Bounded coin-change over the codes actually in stock, solved exactly.
   *
   * The previous search gave up after ten codes, so a $150 order against a
   * shelf of $10 codes was refused as impossible when fifteen of them would
   * have filled it. There is no such cap here: a combination is refused only
   * when the stock genuinely cannot reach the amount.
   *
   * Everything is first divided by the greatest common divisor of the values
   * and the target, which shrinks a table of 15,000 cents to one of 15 steps
   * when every code is a round ten dollars. A target still too large after that
   * falls back to the depth-limited search rather than allocating a huge table.
   */
  private fewestCodesForTarget(
    stock: DenominationStock[],
    values: number[],
    target: number,
  ): { denominationId: string; faceValue: number; count: number }[] | null {
    const unit = values.reduce(
      (acc, value) => AllocationEngineService.gcd(acc, value),
      target,
    );
    // A target that shares no divisor with any code value cannot be met, and
    // the gcd above always divides the target, so this only guards against 0.
    if (!unit) return null;

    const steps = target / unit;
    const scaled = values.map((value) => value / unit);

    const BUDGET = 4_000_000;
    if ((steps + 1) * stock.length > BUDGET) {
      this.logger.warn(
        `[Allocation] Target of ${target} cents is too large to solve exactly; using the depth-limited search.`,
      );
      return this.depthLimitedSearch(stock, values, target);
    }

    // codes[sum] — fewest codes that reach `sum`; -1 when unreachable.
    // usedAt[i][sum] — how many of denomination i that solution took, so the
    // combination can be read back rather than recomputed.
    let codes = new Int32Array(steps + 1).fill(-1);
    codes[0] = 0;
    const usedAt: Int32Array[] = [];

    for (let i = 0; i < scaled.length; i++) {
      const next = new Int32Array(steps + 1).fill(-1);
      const used = new Int32Array(steps + 1).fill(0);
      const maxUses = Math.min(stock[i].availableCount, Math.floor(steps / scaled[i]));

      for (let sum = 0; sum <= steps; sum++) {
        if (codes[sum] < 0) continue;
        for (let k = 0; k <= maxUses; k++) {
          const reached = sum + k * scaled[i];
          if (reached > steps) break;
          const total = codes[sum] + k;
          if (next[reached] < 0 || total < next[reached]) {
            next[reached] = total;
            used[reached] = k;
          }
        }
      }

      codes = next;
      usedAt.push(used);
    }

    if (codes[steps] < 0) return null;

    // Walk the choices back to the empty basket.
    const combination: { denominationId: string; faceValue: number; count: number }[] = [];
    let sum = steps;
    for (let i = scaled.length - 1; i >= 0; i--) {
      const count = usedAt[i][sum];
      if (count > 0) {
        combination.push({
          denominationId: stock[i].denominationId,
          faceValue: stock[i].faceValue,
          count,
        });
        sum -= count * scaled[i];
      }
    }

    return sum === 0 && combination.length > 0 ? combination.reverse() : null;
  }

  /**
   * Iterative-deepening fallback, used only for a target too large to tabulate.
   * Tries two codes, then three, and so on, so the first answer found is also
   * the one using fewest codes.
   */
  private depthLimitedSearch(
    stock: DenominationStock[],
    values: number[],
    target: number,
  ): { denominationId: string; faceValue: number; count: number }[] | null {
    const maxCodes = 12;
    const remaining = stock.map((d) => d.availableCount);

    for (let depth = 2; depth <= maxCodes; depth++) {
      const picked = this.searchAtDepth(stock, values, remaining, target, depth, 0, []);
      if (picked) {
        const counts = new Map<number, number>();
        for (const index of picked) counts.set(index, (counts.get(index) ?? 0) + 1);
        return [...counts.entries()].map(([index, count]) => ({
          denominationId: stock[index].denominationId,
          faceValue: stock[index].faceValue,
          count,
        }));
      }
    }

    return null;
  }

  /** Indices of the codes chosen, or null if this depth cannot reach the target. */
  private searchAtDepth(
    stock: DenominationStock[],
    values: number[],
    remaining: number[],
    target: number,
    maxDepth: number,
    startIdx: number,
    chosen: number[],
  ): number[] | null {
    const spent = chosen.reduce((acc, index) => acc + values[index], 0);
    if (chosen.length === maxDepth) {
      return spent === target ? [...chosen] : null;
    }

    const left = target - spent;
    if (left <= 0) return null;

    const slots = maxDepth - chosen.length;
    let smallest = Infinity;
    let largest = 0;
    for (let i = startIdx; i < stock.length; i++) {
      if (remaining[i] <= 0) continue;
      smallest = Math.min(smallest, values[i]);
      largest = Math.max(largest, values[i]);
    }
    if (largest === 0) return null;
    if (largest * slots < left) return null;
    if (smallest * slots > left) return null;

    for (let i = startIdx; i < stock.length; i++) {
      if (remaining[i] <= 0) continue;
      if (values[i] > left) continue;

      remaining[i]--;
      chosen.push(i);
      const result = this.searchAtDepth(stock, values, remaining, target, maxDepth, i, chosen);
      chosen.pop();
      remaining[i]++;
      if (result) return result;
    }

    return null;
  }

  /**
   * Confirms reserved codes as ALLOCATED (after wallet debit succeeds).
   */
  async confirmAllocation(
    tx: Prisma.TransactionClient,
    fulfillmentRequestId: string,
    allocationResults: AllocationResult[],
  ): Promise<void> {
    const allCodeItemIds = allocationResults.flatMap((r) => r.codeItemIds);

    await tx.codeItem.updateMany({
      where: {
        id: { in: allCodeItemIds },
        reservedByReqId: fulfillmentRequestId,
        status: 'RESERVED',
      },
      data: {
        status: 'ALLOCATED',
        reservedUntil: null,
      },
    });

    // Create allocation record
    await tx.allocation.create({
      data: {
        fulfillmentId: fulfillmentRequestId,
        codeItemIds: JSON.stringify(allCodeItemIds),
        status: 'ALLOCATED',
      },
    });
  }

  /**
   * Releases reserved codes back to AVAILABLE (on failure/expiry).
   */
  async releaseReservation(
    tx: Prisma.TransactionClient,
    fulfillmentRequestId: string,
  ): Promise<void> {
    await tx.codeItem.updateMany({
      where: {
        reservedByReqId: fulfillmentRequestId,
        status: 'RESERVED',
      },
      data: {
        status: 'AVAILABLE',
        reservedUntil: null,
        reservedByReqId: null,
      },
    });
  }

  /**
   * Reverses an allocation — codes back to AVAILABLE, wallet credited back.
   */
  async reverseAllocation(
    tx: Prisma.TransactionClient,
    fulfillmentRequestId: string,
  ): Promise<void> {
    // Get allocation
    const allocation = await tx.allocation.findFirst({
      where: { fulfillmentId: fulfillmentRequestId },
    });

    if (!allocation) return;

    const ids: string[] = JSON.parse(allocation.codeItemIds || '[]');
    // Release codes back to AVAILABLE (only if not yet DELIVERED)
    await tx.codeItem.updateMany({
      where: {
        id: { in: ids },
        status: { in: ['ALLOCATED', 'RESERVED'] },
      },
      data: {
        status: 'AVAILABLE',
        reservedUntil: null,
        reservedByReqId: null,
      },
    });

    // Mark allocation as REVERSED
    await tx.allocation.update({
      where: { id: allocation.id },
      data: { status: 'REVERSED' },
    });
  }

  /**
   * Gets available denomination stock for a product.
   If merchantId is provided, returns stock for that merchant only.
   If merchantId is null/undefined, returns DCV-owned stock (merchantId is null).
   If merchantId is '__ALL__', returns all stock regardless of owner.
   */
  async getAvailableStock(
    tx: Prisma.TransactionClient | PrismaService,
    productId: string,
    merchantId?: string | null,
  ): Promise<DenominationStock[]> {
    const codeItemWhere: any = { status: 'AVAILABLE' };
    if (merchantId === '__ALL__') {
      // No merchant filter — return all available codes
    } else if (merchantId) {
      codeItemWhere.merchantId = merchantId;
    } else {
      codeItemWhere.merchantId = null;
    }

    const denominations = await (tx as PrismaService).denomination.findMany({
      where: { productId },
      include: {
        codeItems: {
          where: codeItemWhere,
          select: { id: true },
        },
      },
    });

    return denominations.map((d) => ({
      denominationId: d.id,
      faceValue: Number(d.faceValue),
      availableCount: d.codeItems.length,
    }));
  }

  /**
   * Reserves specific code items for a fulfillment request.
   Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent double-allocation under concurrency.
   All within a transaction.
   If merchantId is provided, only reserves codes owned by that merchant.
   If merchantId is null/undefined, only reserves DCV-owned codes (merchantId is null).
   */
  /**
   * Choose which codes to hand out, honouring the batch order the admin set.
   * Batches are drained in ascending `priority`, and within a batch the oldest
   * code goes first, so a batch marked to clear first empties before the next is
   * touched. Codes belonging to no batch are used last, once the ordered batches
   * are exhausted, so they never jump ahead of a deliberate ordering.
   *
   * There is no Prisma relation from CodeItem to CodeBatch — historical rows
   * carry batch ids with no matching batch — so the order is resolved here
   * rather than through a join.
   */
  private async pickCodesInBatchOrder(
    tx: Prisma.TransactionClient,
    codeItemWhere: any,
    combo: { denominationId: string; count: number },
  ): Promise<{ id: string; denominationId: string }[]> {
    const batches = await tx.codeBatch.findMany({
      where: { denominationId: combo.denominationId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const picked: { id: string; denominationId: string }[] = [];
    for (const batch of batches) {
      if (picked.length >= combo.count) break;
      const fromBatch = await tx.codeItem.findMany({
        where: { ...codeItemWhere, batchId: batch.id },
        orderBy: { createdAt: 'asc' },
        take: combo.count - picked.length,
        select: { id: true, denominationId: true },
      });
      picked.push(...fromBatch);
    }

    if (picked.length < combo.count) {
      // `notIn` alone would drop rows with a null batchId, because SQL compares
      // NULL as unknown — and an unbatched code is exactly what this is for.
      const loose = await tx.codeItem.findMany({
        where: {
          ...codeItemWhere,
          ...(batches.length
            ? { OR: [{ batchId: null }, { batchId: { notIn: batches.map((b) => b.id) } }] }
            : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: combo.count - picked.length,
        select: { id: true, denominationId: true },
      });
      picked.push(...loose);
    }
    return picked;
  }

  async reserveCodes(
    tx: Prisma.TransactionClient,
    fulfillmentRequestId: string,
    combination: { denominationId: string; faceValue: number; count: number }[],
    reservationTtlMinutes: number,
    merchantId?: string | null,
  ): Promise<AllocationResult[]> {
    const reservedUntil = new Date(Date.now() + reservationTtlMinutes * 60 * 1000);
    const results: AllocationResult[] = [];

    for (const combo of combination) {
      const codeItemWhere: any = { denominationId: combo.denominationId, status: 'AVAILABLE' };
      if (merchantId) {
        codeItemWhere.merchantId = merchantId;
      } else {
        codeItemWhere.merchantId = null;
      }

      const codeItems = await this.pickCodesInBatchOrder(tx, codeItemWhere, combo);

      if (codeItems.length < combo.count) {
        throw new BadRequestException({
          error: 'INSUFFICIENT_STOCK',
          code: 'INSUFFICIENT_STOCK',
          message: `Only ${codeItems.length} codes available for denomination ${combo.faceValue}, needed ${combo.count}`,
        });
      }

      const codeItemIds = codeItems.map((c) => c.id);

      const updateWhere: any = {
        id: { in: codeItemIds },
        status: 'AVAILABLE',
      };
      if (merchantId) {
        updateWhere.merchantId = merchantId;
      } else {
        updateWhere.merchantId = null;
      }

      const updateResult = await tx.codeItem.updateMany({
        where: updateWhere,
        data: {
          status: 'RESERVED',
          reservedUntil,
          reservedByReqId: fulfillmentRequestId,
        },
      });

      if (updateResult.count < combo.count) {
        throw new BadRequestException({
          error: 'INSUFFICIENT_STOCK',
          code: 'STOCK_CONFLICT',
          message: `Stock conflict detected for denomination ${combo.faceValue}. ${updateResult.count}/${combo.count} codes available after concurrent request. Please retry.`,
        });
      }

      results.push({
        denominationId: combo.denominationId,
        faceValue: combo.faceValue,
        codeItemIds,
      });
    }

    return results;
  }
}
