import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export {
  PrismaClient,
  Prisma,
  Platform,
  LedgerReason,
  ItemType,
  RedemptionStatus,
  LiveStatus,
  CommandPermission,
  ModPunishment,
  EngagementStatus,
  OverlayKind,
  MediaStatus,
} from "@prisma/client";

export type {
  User,
  Account,
  Session,
  Channel,
  LoyaltySettings,
  ViewerProfile,
  PointLedger,
  StoreTheme,
  StoreCategory,
  StoreItem,
  AccessCode,
  Redemption,
  LiveStream,
  WatchSession,
  BlockedUser,
  ChatCommand,
  ChatTimer,
  ChatCounter,
  CommandLog,
  Quote,
  QueueEntry,
  ModerationSettings,
  ModerationLog,
  Giveaway,
  EngagementSettings,
  GiveawayEntry,
  Poll,
  PollOption,
  PollVote,
  BettingRound,
  BettingOption,
  Bet,
  OverlayAccess,
  AlertSettings,
  AlertEvent,
  MediaSettings,
  MediaQueueItem,
  MediaSkipVote,
  BotConnection,
  WorkerLease,
} from "@prisma/client";
