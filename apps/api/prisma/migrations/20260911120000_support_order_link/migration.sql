-- A support message can name the order it is about.
ALTER TABLE "SupportMessage" ADD COLUMN IF NOT EXISTS "fulfillmentId" TEXT;
CREATE INDEX IF NOT EXISTS "SupportMessage_fulfillmentId_idx" ON "SupportMessage"("fulfillmentId");
