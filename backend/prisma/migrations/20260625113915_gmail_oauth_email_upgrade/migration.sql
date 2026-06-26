/*
  Warnings:

  - You are about to drop the column `imapAppPassword` on the `EmailSyncCredential` table. All the data in the column will be lost.
  - You are about to drop the column `imapUser` on the `EmailSyncCredential` table. All the data in the column will be lost.
  - Added the required column `email` to the `EmailSyncCredential` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refreshTokenEnc` to the `EmailSyncCredential` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "body" TEXT,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "linkedApplicationId" TEXT;

-- AlterTable
ALTER TABLE "EmailSyncCredential" DROP COLUMN "imapAppPassword",
DROP COLUMN "imapUser",
ADD COLUMN     "accessTokenEnc" TEXT,
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "refreshTokenEnc" TEXT NOT NULL,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'gmail.readonly',
ADD COLUMN     "tokenExpiry" TIMESTAMP(3);
