-- A grouping inside a category, optionally standing for a region.
CREATE TABLE IF NOT EXISTS "Subcategory" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "slug"       TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "regionId"   TEXT,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    "active"     BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Subcategory_slug_key" ON "Subcategory"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Subcategory_categoryId_name_key" ON "Subcategory"("categoryId", "name");
CREATE INDEX IF NOT EXISTS "Subcategory_categoryId_idx" ON "Subcategory"("categoryId");
CREATE INDEX IF NOT EXISTS "Subcategory_regionId_idx" ON "Subcategory"("regionId");

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT;
CREATE INDEX IF NOT EXISTS "Product_subcategoryId_idx" ON "Product"("subcategoryId");

-- Prisma's default relation mode expects real foreign keys: without them the
-- onDelete rules in the schema never fire, so deleting a category would leave
-- its subcategories behind pointing at nothing.
ALTER TABLE "Subcategory" DROP CONSTRAINT IF EXISTS "Subcategory_categoryId_fkey";
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subcategory" DROP CONSTRAINT IF EXISTS "Subcategory_regionId_fkey";
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_subcategoryId_fkey";
ALTER TABLE "Product" ADD CONSTRAINT "Product_subcategoryId_fkey"
  FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
