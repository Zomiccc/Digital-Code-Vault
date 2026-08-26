"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AllocationEngineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllocationEngineService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let AllocationEngineService = AllocationEngineService_1 = class AllocationEngineService {
    prisma;
    logger = new common_1.Logger(AllocationEngineService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    findBestCombination(denominations, targetAmount) {
        if (targetAmount <= 0) {
            return null;
        }
        const sorted = [...denominations]
            .filter((d) => d.availableCount > 0 && d.faceValue > 0)
            .sort((a, b) => b.faceValue - a.faceValue);
        if (sorted.length === 0) {
            return null;
        }
        for (const d of sorted) {
            if (d.faceValue === targetAmount && d.availableCount >= 1) {
                return [{ denominationId: d.denominationId, faceValue: d.faceValue, count: 1 }];
            }
        }
        const result = this.subsetSumSearch(sorted, targetAmount);
        return result;
    }
    subsetSumSearch(denominations, target) {
        const maxCodes = 10;
        const remaining = denominations.map((d) => d.availableCount);
        for (let depth = 2; depth <= maxCodes; depth++) {
            const result = this.searchAtDepth(denominations, remaining, target, depth, 0, []);
            if (result) {
                const counts = new Map();
                for (const item of result) {
                    const existing = counts.get(item.denominationId);
                    if (existing) {
                        existing.count++;
                    }
                    else {
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
    searchAtDepth(denominations, remaining, target, maxDepth, currentDepth, currentSelection) {
        if (currentDepth === maxDepth) {
            const sum = currentSelection.reduce((acc, s) => acc + s.faceValue, 0);
            return sum === target ? [...currentSelection] : null;
        }
        const remainingTarget = target - currentSelection.reduce((acc, s) => acc + s.faceValue, 0);
        if (remainingTarget <= 0) {
            return null;
        }
        const remainingSlots = maxDepth - currentDepth;
        const availableDenoms = denominations.filter((_, i) => remaining[i] > 0);
        if (availableDenoms.length === 0)
            return null;
        const maxDenom = Math.max(...availableDenoms.map((d) => d.faceValue));
        if (maxDenom * remainingSlots < remainingTarget)
            return null;
        const minDenom = Math.min(...availableDenoms.map((d) => d.faceValue));
        if (minDenom * remainingSlots > remainingTarget)
            return null;
        const startIdx = currentSelection.length > 0
            ? denominations.findIndex((d) => d.denominationId === currentSelection[currentSelection.length - 1].denominationId)
            : 0;
        for (let i = startIdx; i < denominations.length; i++) {
            if (remaining[i] <= 0)
                continue;
            const d = denominations[i];
            if (d.faceValue > remainingTarget)
                continue;
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
    async confirmAllocation(tx, fulfillmentRequestId, allocationResults) {
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
        await tx.allocation.create({
            data: {
                fulfillmentId: fulfillmentRequestId,
                codeItemIds: JSON.stringify(allCodeItemIds),
                status: 'ALLOCATED',
            },
        });
    }
    async releaseReservation(tx, fulfillmentRequestId) {
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
    async reverseAllocation(tx, fulfillmentRequestId) {
        const allocation = await tx.allocation.findFirst({
            where: { fulfillmentId: fulfillmentRequestId },
        });
        if (!allocation)
            return;
        const ids = JSON.parse(allocation.codeItemIds || '[]');
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
        await tx.allocation.update({
            where: { id: allocation.id },
            data: { status: 'REVERSED' },
        });
    }
    async getAvailableStock(tx, productId, merchantId) {
        const codeItemWhere = { status: 'AVAILABLE' };
        if (merchantId === '__ALL__') {
        }
        else if (merchantId) {
            codeItemWhere.merchantId = merchantId;
        }
        else {
            codeItemWhere.merchantId = null;
        }
        const denominations = await tx.denomination.findMany({
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
    async reserveCodes(tx, fulfillmentRequestId, combination, reservationTtlMinutes, merchantId) {
        const reservedUntil = new Date(Date.now() + reservationTtlMinutes * 60 * 1000);
        const results = [];
        for (const combo of combination) {
            const codeItemWhere = { denominationId: combo.denominationId, status: 'AVAILABLE' };
            if (merchantId) {
                codeItemWhere.merchantId = merchantId;
            }
            else {
                codeItemWhere.merchantId = null;
            }
            const codeItems = await tx.codeItem.findMany({
                where: codeItemWhere,
                orderBy: { createdAt: 'asc' },
                take: combo.count,
                select: { id: true, denominationId: true },
            });
            if (codeItems.length < combo.count) {
                throw new common_1.BadRequestException({
                    error: 'INSUFFICIENT_STOCK',
                    code: 'INSUFFICIENT_STOCK',
                    message: `Only ${codeItems.length} codes available for denomination ${combo.faceValue}, needed ${combo.count}`,
                });
            }
            const codeItemIds = codeItems.map((c) => c.id);
            const updateWhere = {
                id: { in: codeItemIds },
                status: 'AVAILABLE',
            };
            if (merchantId) {
                updateWhere.merchantId = merchantId;
            }
            else {
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
                throw new common_1.BadRequestException({
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
};
exports.AllocationEngineService = AllocationEngineService;
exports.AllocationEngineService = AllocationEngineService = AllocationEngineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AllocationEngineService);
//# sourceMappingURL=allocation-engine.service.js.map