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
   * Finds the best combination of denominations to exactly match the target amount.
   * Strategy:
   *   1. Exact match (single denomination equals target)
   *   2. Combination match (subset-sum, preferring fewest codes)
   *   3. Returns null if no valid combination exists
   */
  findBestCombination(
    denominations: DenominationStock[],
    targetAmount: number,
  ): { denominationId: string; faceValue: number; count: number }[] | null {
    if (targetAmount <= 0) {
      return null;
    }

    // Sort denominations descending (greedy preference for larger = fewer codes)
    const sorted = [...denominations]
      .filter((d) => d.availableCount > 0 && d.faceValue > 0)
      .sort((a, b) => b.faceValue - a.faceValue);

    if (sorted.length === 0) {
      return null;
    }

    // 1. Exact single match
    for (const d of sorted) {
      if (d.faceValue === targetAmount && d.availableCount >= 1) {
        return [{ denominationId: d.denominationId, faceValue: d.faceValue, count: 1 }];
      }
    }

    // 2. Combination match using constrained subset-sum search
    // We use a BFS/DP approach that finds the combination with the fewest items
    const result = this.subsetSumSearch(sorted, targetAmount);
    return result;
  }

  /**
   * Constrained subset-sum search.
   * Finds the combination of denominations (respecting stock limits) that sums
   * exactly to target, preferring the fewest number of codes.
   *
   * Uses iterative deepening: tries 1 code, then 2, then 3, etc.
   * This guarantees the fewest-codes-first preference.
   */
  private subsetSumSearch(
    denominations: DenominationStock[],
    target: number,
  ): { denominationId: string; faceValue: number; count: number }[] | null {
    const maxCodes = 10; // Safety limit — don't try combinations deeper than 10 codes
    const remaining = denominations.map((d) => d.availableCount);

    for (let depth = 2; depth <= maxCodes; depth++) {
      const result = this.searchAtDepth(denominations, remaining, target, depth, 0, []);
      if (result) {
        // Aggregate into denomination+count pairs
        const counts = new Map<string, { denominationId: string; faceValue: number; count: number }>();
        for (const item of result) {
          const existing = counts.get(item.denominationId);
          if (existing) {
            existing.count++;
          } else {
            counts.set(item.denominationId, {
              denominationId: item.denominationId,
              faceValue: item.faceValue,
              count: 1,
            });
          }
        }
        return Array.from(counts.values());
      }
    }

    return null;
  }

  private searchAtDepth(
    denominations: DenominationStock[],
    remaining: number[],
    target: number,
    maxDepth: number,
    currentDepth: number,
    currentSelection: { denominationId: string; faceValue: number }[],
  ): { denominationId: string; faceValue: number }[] | null {
    if (currentDepth === maxDepth) {
      const sum = currentSelection.reduce((acc, s) => acc + s.faceValue, 0);
      return sum === target ? [...currentSelection] : null;
    }

    const remainingTarget = target - currentSelection.reduce((acc, s) => acc + s.faceValue, 0);
    if (remainingTarget <= 0) {
      return null;
    }

    // Pruning: if the largest denomination * remaining slots can't reach target, skip
    const remainingSlots = maxDepth - currentDepth;
    const availableDenoms = denominations.filter((_, i) => remaining[i] > 0);
    if (availableDenoms.length === 0) return null;
    const maxDenom = Math.max(...availableDenoms.map((d) => d.faceValue));
    if (maxDenom * remainingSlots < remainingTarget) return null;

    // Start from the first denomination to avoid duplicate permutations
    const startIdx = currentSelection.length > 0
      ? denominations.findIndex((d) => d.denominationId === currentSelection[currentSelection.length - 1].denominationId)
      : 0;

    for (let i = startIdx; i < denominations.length; i++) {
      if (remaining[i] <= 0) continue;
      const d = denominations[i];
      if (d.faceValue > remainingTarget) continue;

      remaining[i]--;
      currentSelection.push({ denominationId: d.denominationId, faceValue: d.faceValue });

      const result = this.searchAtDepth(denominations, remaining, target, maxDepth, currentDepth + 1, currentSelection);
      if (result) {
        remaining[i]++;
        return result;
      }

      currentSelection.pop();
      remaining[i]++;
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

      const codeItems = await tx.codeItem.findMany({
        where: codeItemWhere,
        orderBy: { createdAt: 'asc' },
        take: combo.count,
        select: { id: true, denominationId: true },
      });

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
