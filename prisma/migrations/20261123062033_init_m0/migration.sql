-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('NFL', 'MLB', 'NBA', 'NHL');

-- CreateEnum
CREATE TYPE "LeagueFormat" AS ENUM ('DYNASTY', 'REDRAFT');

-- CreateEnum
CREATE TYPE "LeagueRole" AS ENUM ('COMMISSIONER', 'MANAGER');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "LeagueFormat" NOT NULL,
    "maxTeams" INTEGER NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "presetId" UUID NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueMember" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "LeagueRole" NOT NULL DEFAULT 'MANAGER',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueSport" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "sport" "Sport" NOT NULL,

    CONSTRAINT "LeagueSport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringPreset" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "experimental" BOOLEAN NOT NULL,

    CONSTRAINT "ScoringPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringRule" (
    "id" UUID NOT NULL,
    "presetId" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "statKey" TEXT NOT NULL,
    "coefficient" DECIMAL(8,1) NOT NULL,
    "applicability" TEXT NOT NULL,

    CONSTRAINT "ScoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "displayName" TEXT NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");

-- CreateIndex
CREATE INDEX "LeagueMember_userId_idx" ON "LeagueMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueMember_leagueId_userId_key" ON "LeagueMember"("leagueId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueSport_leagueId_sport_key" ON "LeagueSport"("leagueId", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringPreset_version_key" ON "ScoringPreset"("version");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRule_presetId_sport_statKey_key" ON "ScoringRule"("presetId", "sport", "statKey");

-- CreateIndex
CREATE INDEX "Player_sport_displayName_idx" ON "Player"("sport", "displayName");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "ScoringPreset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueSport" ADD CONSTRAINT "LeagueSport_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringRule" ADD CONSTRAINT "ScoringRule_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "ScoringPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
