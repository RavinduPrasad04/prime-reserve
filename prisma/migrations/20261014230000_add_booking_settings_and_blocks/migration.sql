CREATE TABLE "booking_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "restrict_saturday" BOOLEAN NOT NULL DEFAULT false,
    "restrict_sunday" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "booking_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_blocks" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "resource_id" UUID,
    "reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_blocks_date_resource_id_idx" ON "booking_blocks"("date", "resource_id");
CREATE UNIQUE INDEX "booking_blocks_date_resource_id_key" ON "booking_blocks"("date", "resource_id") WHERE "resource_id" IS NOT NULL;
CREATE UNIQUE INDEX "booking_blocks_date_global_key" ON "booking_blocks"("date") WHERE "resource_id" IS NULL;

ALTER TABLE "booking_blocks"
ADD CONSTRAINT "booking_blocks_resource_id_fkey"
FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
