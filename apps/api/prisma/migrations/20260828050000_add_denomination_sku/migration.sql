-- AlterTable
ALTER TABLE "Denomination" ADD COLUMN "sku" TEXT;

-- CreateIndex
CREATE INDEX "Denomination_sku_idx" ON "Denomination"("sku");
