-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('YOUTUBE', 'TWITCH');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('CHAT_ACTIVITY', 'LURK_TIME', 'GIVE', 'COMMAND_COST', 'WATCH_TIME', 'NEW_MEMBER', 'MEMBER_MILESTONE', 'SUPER_CHAT', 'SUPER_STICKER', 'GIFT_GIVEN', 'GIFT_RECEIVED', 'FOLLOW', 'SUBSCRIPTION', 'BITS', 'RAID', 'MANUAL', 'REDEEM', 'REFUND', 'GAMBLE', 'SLOTS', 'DUEL', 'HEIST', 'GIVEAWAY', 'BET', 'BET_PAYOUT', 'MEDIA_SHARE');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('PERK', 'SOUND', 'CODE');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LiveStatus" AS ENUM ('LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "CommandPermission" AS ENUM ('EVERYONE', 'MODERATOR');

-- CreateEnum
CREATE TYPE "ModPunishment" AS ENUM ('DELETE', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "EngagementStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OverlayKind" AS ENUM ('ALERTS', 'MEDIA');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'PLAYING', 'PLAYED', 'SKIPPED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "ytChannelId" TEXT,
    "twitchUserId" TEXT,
    "twitchLogin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'YOUTUBE',
    "platformChannelId" TEXT NOT NULL,
    "platformLogin" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "queueOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltySettings" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "currencyName" TEXT NOT NULL DEFAULT 'pontos',
    "payoutIntervalMin" INTEGER NOT NULL DEFAULT 10,
    "pointsPerIntervalActive" INTEGER NOT NULL DEFAULT 10,
    "watchEarnEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pointsPerIntervalWatch" INTEGER NOT NULL DEFAULT 10,
    "maxWatchPointsPerStream" INTEGER NOT NULL DEFAULT 500,
    "memberMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "pointsOnNewMember" INTEGER NOT NULL DEFAULT 300,
    "pointsPerSuperChatUnit" INTEGER NOT NULL DEFAULT 50,
    "pointsOnSuperSticker" INTEGER NOT NULL DEFAULT 100,
    "pointsOnGiftGiver" INTEGER NOT NULL DEFAULT 200,
    "pointsOnGiftReceiver" INTEGER NOT NULL DEFAULT 100,
    "pointsPerIntervalLurker" INTEGER NOT NULL DEFAULT 5,
    "pointsOnFollow" INTEGER NOT NULL DEFAULT 100,
    "pointsOnSub" INTEGER NOT NULL DEFAULT 300,
    "pointsPerBits100" INTEGER NOT NULL DEFAULT 50,
    "pointsOnRaid" INTEGER NOT NULL DEFAULT 200,

    CONSTRAINT "LoyaltySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedUser" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "BlockedUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewerProfile" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "isModerator" BOOLEAN NOT NULL DEFAULT false,
    "isMember" BOOLEAN NOT NULL DEFAULT false,
    "points" INTEGER NOT NULL DEFAULT 0,
    "activeMinutes" INTEGER NOT NULL DEFAULT 0,
    "watchMinutes" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointLedger" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "LedgerReason" NOT NULL,
    "refId" TEXT,
    "idempotencyKey" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreTheme" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL DEFAULT '#7c3aed',
    "darkMode" BOOLEAN NOT NULL DEFAULT true,
    "layout" TEXT NOT NULL DEFAULT 'grid',
    "bannerUrl" TEXT,
    "logoUrl" TEXT,
    "backgroundUrl" TEXT,
    "headline" TEXT,
    "about" TEXT,
    "socialLinks" JSONB,

    CONSTRAINT "StoreTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCategory" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StoreCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreItem" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ItemType" NOT NULL DEFAULT 'PERK',
    "cost" INTEGER NOT NULL,
    "stock" INTEGER,
    "globalCooldownSec" INTEGER NOT NULL DEFAULT 0,
    "userCooldownSec" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "soundUrl" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StoreItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessCode" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "AccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "codeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveStream" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "liveChatId" TEXT,
    "status" "LiveStatus" NOT NULL DEFAULT 'LIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "LiveStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatCommand" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "response" TEXT NOT NULL,
    "permission" "CommandPermission" NOT NULL DEFAULT 'EVERYONE',
    "costPoints" INTEGER NOT NULL DEFAULT 0,
    "globalCooldownSec" INTEGER NOT NULL DEFAULT 5,
    "userCooldownSec" INTEGER NOT NULL DEFAULT 15,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChatCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatTimer" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "intervalMin" INTEGER NOT NULL DEFAULT 15,
    "minChatLines" INTEGER NOT NULL DEFAULT 5,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChatTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatCounter" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChatCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandLog" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "args" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationSettings" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "punishment" "ModPunishment" NOT NULL DEFAULT 'DELETE',
    "timeoutSec" INTEGER NOT NULL DEFAULT 60,
    "sendWarning" BOOLEAN NOT NULL DEFAULT true,
    "exemptMembers" BOOLEAN NOT NULL DEFAULT false,
    "capsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "capsMinLen" INTEGER NOT NULL DEFAULT 10,
    "capsMaxPercent" INTEGER NOT NULL DEFAULT 70,
    "linksEnabled" BOOLEAN NOT NULL DEFAULT false,
    "linkWhitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wordsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bannedWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "symbolsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "symbolsMaxPercent" INTEGER NOT NULL DEFAULT 50,
    "repetitionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxRepeatedChars" INTEGER NOT NULL DEFAULT 8,
    "linesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxLines" INTEGER NOT NULL DEFAULT 5,
    "zalgoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxCombiningMarks" INTEGER NOT NULL DEFAULT 8,
    "emotesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxEmotes" INTEGER NOT NULL DEFAULT 10,
    "regexEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bannedPatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ModerationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationLog" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "filter" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementSettings" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "gamesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxWager" INTEGER NOT NULL DEFAULT 10000,
    "gameCooldownSec" INTEGER NOT NULL DEFAULT 10,
    "giveawaysEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pollsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bettingEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EngagementSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "keyword" TEXT NOT NULL DEFAULT 'sorteio',
    "ticketCost" INTEGER NOT NULL DEFAULT 0,
    "maxTickets" INTEGER NOT NULL DEFAULT 1,
    "memberWeight" INTEGER NOT NULL DEFAULT 1,
    "status" "EngagementStatus" NOT NULL DEFAULT 'OPEN',
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayEntry" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "tickets" INTEGER NOT NULL DEFAULT 1,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "EngagementStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BettingRound" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "EngagementStatus" NOT NULL DEFAULT 'OPEN',
    "winnerOptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "BettingRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BettingOption" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "BettingOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverlayAccess" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" "OverlayKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverlayAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertSettings" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "durationSec" INTEGER NOT NULL DEFAULT 7,
    "volume" INTEGER NOT NULL DEFAULT 80,
    "accentColor" TEXT NOT NULL DEFAULT '#7c3aed',
    "template" TEXT NOT NULL DEFAULT '{message}',
    "soundUrl" TEXT,
    "followsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "membershipsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "paidEnabled" BOOLEAN NOT NULL DEFAULT true,
    "raidsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "redemptionsEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AlertSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userName" TEXT,
    "message" TEXT NOT NULL,
    "amount" INTEGER,
    "imageUrl" TEXT,
    "soundUrl" TEXT,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaSettings" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cost" INTEGER NOT NULL DEFAULT 100,
    "maxDurationSec" INTEGER NOT NULL DEFAULT 120,
    "maxQueueSize" INTEGER NOT NULL DEFAULT 25,
    "volume" INTEGER NOT NULL DEFAULT 70,
    "votesToSkip" INTEGER NOT NULL DEFAULT 3,
    "blacklist" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "MediaSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaQueueItem" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "viewerId" TEXT,
    "url" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT,
    "durationSec" INTEGER,
    "cost" INTEGER NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "skipVotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playedAt" TIMESTAMP(3),

    CONSTRAINT "MediaQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaSkipVote" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,

    CONSTRAINT "MediaSkipVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotConnection" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'YOUTUBE',
    "platformUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerLease" (
    "channelId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerLease_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "WatchSession" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewerId" TEXT,
    "videoId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validSeconds" INTEGER NOT NULL DEFAULT 0,
    "creditedSeconds" INTEGER NOT NULL DEFAULT 0,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "WatchSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_ytChannelId_key" ON "User"("ytChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "User_twitchUserId_key" ON "User"("twitchUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_ownerId_key" ON "Channel"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_slug_key" ON "Channel"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_platform_platformChannelId_key" ON "Channel"("platform", "platformChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltySettings_channelId_key" ON "LoyaltySettings"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedUser_channelId_platformUserId_key" ON "BlockedUser"("channelId", "platformUserId");

-- CreateIndex
CREATE INDEX "ViewerProfile_channelId_points_idx" ON "ViewerProfile"("channelId", "points");

-- CreateIndex
CREATE UNIQUE INDEX "ViewerProfile_channelId_platformUserId_key" ON "ViewerProfile"("channelId", "platformUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PointLedger_idempotencyKey_key" ON "PointLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PointLedger_channelId_createdAt_idx" ON "PointLedger"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "PointLedger_viewerId_createdAt_idx" ON "PointLedger"("viewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreTheme_channelId_key" ON "StoreTheme"("channelId");

-- CreateIndex
CREATE INDEX "StoreCategory_channelId_sortOrder_idx" ON "StoreCategory"("channelId", "sortOrder");

-- CreateIndex
CREATE INDEX "StoreItem_channelId_sortOrder_idx" ON "StoreItem"("channelId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_codeId_key" ON "Redemption"("codeId");

-- CreateIndex
CREATE INDEX "Redemption_channelId_createdAt_idx" ON "Redemption"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveStream_channelId_status_idx" ON "LiveStream"("channelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LiveStream_channelId_videoId_key" ON "LiveStream"("channelId", "videoId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatCommand_channelId_name_key" ON "ChatCommand"("channelId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ChatCounter_channelId_name_key" ON "ChatCounter"("channelId", "name");

-- CreateIndex
CREATE INDEX "CommandLog_channelId_createdAt_idx" ON "CommandLog"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "CommandLog_channelId_command_idx" ON "CommandLog"("channelId", "command");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_channelId_number_key" ON "Quote"("channelId", "number");

-- CreateIndex
CREATE INDEX "QueueEntry_channelId_joinedAt_idx" ON "QueueEntry"("channelId", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueueEntry_channelId_viewerId_key" ON "QueueEntry"("channelId", "viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationSettings_channelId_key" ON "ModerationSettings"("channelId");

-- CreateIndex
CREATE INDEX "ModerationLog_channelId_createdAt_idx" ON "ModerationLog"("channelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementSettings_channelId_key" ON "EngagementSettings"("channelId");

-- CreateIndex
CREATE INDEX "Giveaway_channelId_status_idx" ON "Giveaway"("channelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayEntry_giveawayId_viewerId_key" ON "GiveawayEntry"("giveawayId", "viewerId");

-- CreateIndex
CREATE INDEX "Poll_channelId_status_idx" ON "Poll"("channelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PollOption_pollId_number_key" ON "PollOption"("pollId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_viewerId_key" ON "PollVote"("pollId", "viewerId");

-- CreateIndex
CREATE INDEX "BettingRound_channelId_status_idx" ON "BettingRound"("channelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BettingOption_roundId_number_key" ON "BettingOption"("roundId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Bet_roundId_viewerId_key" ON "Bet"("roundId", "viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "OverlayAccess_tokenHash_key" ON "OverlayAccess"("tokenHash");

-- CreateIndex
CREATE INDEX "OverlayAccess_channelId_kind_idx" ON "OverlayAccess"("channelId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AlertSettings_channelId_key" ON "AlertSettings"("channelId");

-- CreateIndex
CREATE INDEX "AlertEvent_channelId_createdAt_idx" ON "AlertEvent"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "AlertEvent_sourceKey_idx" ON "AlertEvent"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaSettings_channelId_key" ON "MediaSettings"("channelId");

-- CreateIndex
CREATE INDEX "MediaQueueItem_channelId_status_createdAt_idx" ON "MediaQueueItem"("channelId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaSkipVote_itemId_viewerId_key" ON "MediaSkipVote"("itemId", "viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "BotConnection_channelId_key" ON "BotConnection"("channelId");

-- CreateIndex
CREATE INDEX "WatchSession_channelId_userId_endedAt_idx" ON "WatchSession"("channelId", "userId", "endedAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltySettings" ADD CONSTRAINT "LoyaltySettings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewerProfile" ADD CONSTRAINT "ViewerProfile_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "ViewerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreTheme" ADD CONSTRAINT "StoreTheme_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCategory" ADD CONSTRAINT "StoreCategory_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreItem" ADD CONSTRAINT "StoreItem_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreItem" ADD CONSTRAINT "StoreItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StoreCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessCode" ADD CONSTRAINT "AccessCode_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "ViewerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "AccessCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveStream" ADD CONSTRAINT "LiveStream_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatCommand" ADD CONSTRAINT "ChatCommand_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatTimer" ADD CONSTRAINT "ChatTimer_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatCounter" ADD CONSTRAINT "ChatCounter_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandLog" ADD CONSTRAINT "CommandLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "ViewerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationSettings" ADD CONSTRAINT "ModerationSettings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationLog" ADD CONSTRAINT "ModerationLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementSettings" ADD CONSTRAINT "EngagementSettings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "ViewerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayEntry" ADD CONSTRAINT "GiveawayEntry_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayEntry" ADD CONSTRAINT "GiveawayEntry_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "ViewerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "ViewerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BettingRound" ADD CONSTRAINT "BettingRound_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BettingOption" ADD CONSTRAINT "BettingOption_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "BettingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "BettingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "BettingOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "ViewerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverlayAccess" ADD CONSTRAINT "OverlayAccess_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertSettings" ADD CONSTRAINT "AlertSettings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaSettings" ADD CONSTRAINT "MediaSettings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaQueueItem" ADD CONSTRAINT "MediaQueueItem_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaQueueItem" ADD CONSTRAINT "MediaQueueItem_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "ViewerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaSkipVote" ADD CONSTRAINT "MediaSkipVote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MediaQueueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaSkipVote" ADD CONSTRAINT "MediaSkipVote_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "ViewerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotConnection" ADD CONSTRAINT "BotConnection_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSession" ADD CONSTRAINT "WatchSession_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSession" ADD CONSTRAINT "WatchSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSession" ADD CONSTRAINT "WatchSession_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "ViewerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

