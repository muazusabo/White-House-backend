-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentProofUrl" TEXT;

-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "paymentInstructions" TEXT;
