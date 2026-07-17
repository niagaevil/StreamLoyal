-- CreateTable
CREATE TABLE "PendingPointsImport" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'streamlabs',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingPointsImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingPointsImport_channelId_nameKey_key" ON "PendingPointsImport"("channelId", "nameKey");

-- AddForeignKey
ALTER TABLE "PendingPointsImport" ADD CONSTRAINT "PendingPointsImport_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
