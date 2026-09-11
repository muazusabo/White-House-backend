ALTER TABLE "restaurant_settings"
ADD COLUMN "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maintenanceMessage" TEXT;
