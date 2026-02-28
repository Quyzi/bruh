/**
 * Twitch EventSub Event Nodes
 *
 * This module exports registration functions for all Twitch EventSub event nodes,
 * organized by category for better discoverability in the node editor.
 *
 * Categories:
 * - automod: AutoMod message handling and settings
 * - bits: Bits and cheering events
 * - channel: Core channel events (ban, follow, update)
 * - channel_points: Channel Points rewards and redemptions
 * - charity: Charity campaign events
 * - chat: Chat messages and notifications
 * - conduit: Conduit shard management
 * - drops: Twitch Drops entitlements
 * - extension: Extension-related events
 * - goals: Channel goals tracking
 * - guest_star: Guest Star session events
 * - hype_train: Hype Train events
 * - moderation: Moderation actions
 * - poll: Poll events
 * - prediction: Prediction events
 * - raid: Raid events
 * - shared_chat: Shared chat sessions
 * - shield_mode: Shield Mode events
 * - shoutout: Shoutout events
 * - stream: Stream online/offline status
 * - subscription: Subscription events
 * - suspicious_user: Suspicious user detection
 * - unban_request: Unban request handling
 * - user: User authorization and updates
 * - vip: VIP status changes
 * - warning: User warning events
 */

// Automod
import { register as registerAutomod } from "./automod";

// Bits
import { register as registerBits } from "./bits";

// Channel
import { register as registerChannel } from "./channel";

// Channel Points
import { register as registerChannelPoints } from "./channelPoints";

// Charity
import { register as registerCharity } from "./charity";

// Chat
import { register as registerChat } from "./chat";

// Conduit
import { register as registerConduit } from "./conduit";

// Drops
import { register as registerDrops } from "./drops";

// Extension
import { register as registerExtension } from "./extension";

// Goals
import { register as registerGoals } from "./goals";

// Guest Star
import { register as registerGuestStar } from "./guestStar";

// Hype Train
import { register as registerHypeTrain } from "./hypeTrain";

// Moderation
import { register as registerModeration } from "./moderation";

// Poll
import { register as registerPoll } from "./poll";

// Prediction
import { register as registerPrediction } from "./prediction";

// Raid
import { register as registerRaid } from "./raid";

// Shared Chat
import { register as registerSharedChat } from "./sharedChat";

// Shield Mode
import { register as registerShieldMode } from "./shieldMode";

// Shoutout
import { register as registerShoutout } from "./shoutout";

// Stream
import { register as registerStream } from "./stream";

// Subscription
import { register as registerSubscription } from "./subscription";

// Suspicious User
import { register as registerSuspiciousUser } from "./suspiciousUser";

// Unban Request
import { register as registerUnbanRequest } from "./unbanRequest";

// User
import { register as registerUser } from "./user";

// VIP
import { register as registerVip } from "./vip";

// Warning
import { register as registerWarning } from "./warning";

/**
 * Register all Twitch EventSub event nodes
 */
export function registerAllTwitchEvents() {
  registerAutomod();
  registerBits();
  registerChannel();
  registerChannelPoints();
  registerCharity();
  registerChat();
  registerConduit();
  registerDrops();
  registerExtension();
  registerGoals();
  registerGuestStar();
  registerHypeTrain();
  registerModeration();
  registerPoll();
  registerPrediction();
  registerRaid();
  registerSharedChat();
  registerShieldMode();
  registerShoutout();
  registerStream();
  registerSubscription();
  registerSuspiciousUser();
  registerUnbanRequest();
  registerUser();
  registerVip();
  registerWarning();
}
