-- AlterTable
ALTER TABLE "products" ADD COLUMN     "selling_price" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'paid';
