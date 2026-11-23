-- AlterTable
ALTER TABLE "FantasyTeam" ADD COLUMN     "isComputer" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "managerId" DROP NOT NULL,
ALTER COLUMN "membershipId" DROP NOT NULL;
