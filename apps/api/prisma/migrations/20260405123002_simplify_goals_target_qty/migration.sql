/*
  Warnings:

  - You are about to drop the column `daily` on the `sales_goals` table. All the data in the column will be lost.
  - You are about to drop the column `monthly` on the `sales_goals` table. All the data in the column will be lost.
  - You are about to drop the column `weekly` on the `sales_goals` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "sales_goals" DROP COLUMN "daily",
DROP COLUMN "monthly",
DROP COLUMN "weekly",
ADD COLUMN     "target_qty" INTEGER NOT NULL DEFAULT 1;
