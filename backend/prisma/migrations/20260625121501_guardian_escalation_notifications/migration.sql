-- CreateTable
CREATE TABLE "GuardianEscalation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'orange',
    "message" TEXT NOT NULL,
    "supportLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "GuardianEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduleNudges" BOOLEAN NOT NULL DEFAULT true,
    "placementNudges" BOOLEAN NOT NULL DEFAULT true,
    "examNudges" BOOLEAN NOT NULL DEFAULT true,
    "healthNudges" BOOLEAN NOT NULL DEFAULT false,
    "accountabilitySummary" BOOLEAN NOT NULL DEFAULT false,
    "accountabilityEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSettings_userId_key" ON "NotificationSettings"("userId");

-- AddForeignKey
ALTER TABLE "GuardianEscalation" ADD CONSTRAINT "GuardianEscalation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
