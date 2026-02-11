import { createSignal, onMount, Show, For, createEffect } from "solid-js";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  getSetupStatus,
  saveTwitchCredentials,
  getTwitchAuthUrl,
  logoutTwitch,
  exchangeTwitchCode,
  saveTwitchScopes,
  getTwitchScopes,
  type SetupStatus,
} from "../lib/tauri";
import { twitchUsername, setTwitchUsername } from "../lib/authStore";

interface SetupViewProps {
  oauthStatus?: string | null;
  onOauthStatusChange?: (status: string | null) => void;
}

interface ScopeInfo {
  id: string;
  name: string;
  description: string;
  endpoints: string[];
  category: string;
}

// All Twitch OAuth scopes with descriptions
const TWITCH_SCOPES: ScopeInfo[] = [
  // Chat scopes (IRC)
  { id: "chat:read", name: "chat:read", description: "View chat messages sent in a chatroom using an IRC connection", endpoints: ["IRC Chat"], category: "Chat" },
  { id: "chat:edit", name: "chat:edit", description: "Send chat messages to a chatroom using an IRC connection", endpoints: ["IRC Chat"], category: "Chat" },
  
  // User chat scopes (API/EventSub)
  { id: "user:read:chat", name: "user:read:chat", description: "Receive chatroom messages and informational notifications", endpoints: ["Channel Chat Clear", "Channel Chat Message", "Channel Chat Notification", "Channel Chat Settings Update"], category: "Chat" },
  { id: "user:write:chat", name: "user:write:chat", description: "Send chat messages to a chatroom", endpoints: ["Send Chat Message API"], category: "Chat" },
  { id: "user:bot", name: "user:bot", description: "Join a specified chat channel as your user and appear as a bot", endpoints: ["Send Chat Message", "Channel Chat events"], category: "Chat" },
  
  // Channel bot scope
  { id: "channel:bot", name: "channel:bot", description: "Joins your channel's chatroom as a bot user", endpoints: ["Send Chat Message", "Channel Chat events"], category: "Chat" },
  
  // Moderation
  { id: "moderator:manage:chat_messages", name: "moderator:manage:chat_messages", description: "Delete chat messages in channels where you have the moderator role", endpoints: ["Delete Chat Messages"], category: "Moderation" },
  { id: "moderator:read:chatters", name: "moderator:read:chatters", description: "View the chatters in a broadcaster's chat room", endpoints: ["Get Chatters"], category: "Moderation" },
  { id: "moderator:read:chat_settings", name: "moderator:read:chat_settings", description: "View a broadcaster's chat room settings", endpoints: ["Get Chat Settings"], category: "Moderation" },
  { id: "moderator:manage:chat_settings", name: "moderator:manage:chat_settings", description: "Manage a broadcaster's chat room settings", endpoints: ["Update Chat Settings"], category: "Moderation" },
  { id: "moderator:manage:announcements", name: "moderator:manage:announcements", description: "Send announcements in channels where you have the moderator role", endpoints: ["Send Chat Announcement"], category: "Moderation" },
  { id: "moderator:manage:banned_users", name: "moderator:manage:banned_users", description: "Ban and unban users", endpoints: ["Ban User", "Unban User", "Get Banned Users"], category: "Moderation" },
  { id: "moderator:read:banned_users", name: "moderator:read:banned_users", description: "Read the list of bans or unbans in channels", endpoints: ["Channel Moderate events"], category: "Moderation" },
  { id: "moderator:read:blocked_terms", name: "moderator:read:blocked_terms", description: "View a broadcaster's list of blocked terms", endpoints: ["Get Blocked Terms"], category: "Moderation" },
  { id: "moderator:manage:blocked_terms", name: "moderator:manage:blocked_terms", description: "Manage a broadcaster's list of blocked terms", endpoints: ["Add/Remove Blocked Term"], category: "Moderation" },
  { id: "moderator:manage:automod", name: "moderator:manage:automod", description: "Manage messages held for review by AutoMod", endpoints: ["Manage Held AutoMod Messages"], category: "Moderation" },
  { id: "moderator:read:automod_settings", name: "moderator:read:automod_settings", description: "View a broadcaster's AutoMod settings", endpoints: ["Get AutoMod Settings"], category: "Moderation" },
  { id: "moderator:manage:automod_settings", name: "moderator:manage:automod_settings", description: "Manage a broadcaster's AutoMod settings", endpoints: ["Update AutoMod Settings"], category: "Moderation" },
  { id: "moderator:read:followers", name: "moderator:read:followers", description: "Read the followers of a broadcaster", endpoints: ["Get Channel Followers", "Channel Follow event"], category: "Moderation" },
  { id: "moderator:manage:shoutouts", name: "moderator:manage:shoutouts", description: "Manage a broadcaster's shoutouts", endpoints: ["Send a Shoutout"], category: "Moderation" },
  { id: "moderator:read:shoutouts", name: "moderator:read:shoutouts", description: "View a broadcaster's shoutouts", endpoints: ["Shoutout Create/Received events"], category: "Moderation" },
  { id: "moderator:manage:shield_mode", name: "moderator:manage:shield_mode", description: "Manage a broadcaster's Shield Mode status", endpoints: ["Update Shield Mode Status"], category: "Moderation" },
  { id: "moderator:read:shield_mode", name: "moderator:read:shield_mode", description: "View a broadcaster's Shield Mode status", endpoints: ["Get Shield Mode Status"], category: "Moderation" },
  { id: "moderator:manage:warnings", name: "moderator:manage:warnings", description: "Warn users in channels where you have the moderator role", endpoints: ["Warn Chat User"], category: "Moderation" },
  { id: "moderator:read:warnings", name: "moderator:read:warnings", description: "Read warnings in channels where you have the moderator role", endpoints: ["Channel Warning events"], category: "Moderation" },
  { id: "moderator:read:suspicious_users", name: "moderator:read:suspicious_users", description: "Read chat messages from suspicious users", endpoints: ["Suspicious User events"], category: "Moderation" },
  { id: "moderator:manage:suspicious_users", name: "moderator:manage:suspicious_users", description: "Manage suspicious user statuses", endpoints: ["Add/Remove suspicious status"], category: "Moderation" },
  { id: "moderator:read:unban_requests", name: "moderator:read:unban_requests", description: "View a broadcaster's unban requests", endpoints: ["Get Unban Requests"], category: "Moderation" },
  { id: "moderator:manage:unban_requests", name: "moderator:manage:unban_requests", description: "Manage a broadcaster's unban requests", endpoints: ["Resolve Unban Requests"], category: "Moderation" },
  { id: "moderation:read", name: "moderation:read", description: "View a channel's moderation data including Moderators, Bans, Timeouts", endpoints: ["Get Banned Users", "Get Moderators"], category: "Moderation" },
  { id: "channel:moderate", name: "channel:moderate", description: "Perform moderation actions in a channel", endpoints: ["Channel Ban/Unban events"], category: "Moderation" },
  
  // Channel management
  { id: "channel:manage:broadcast", name: "channel:manage:broadcast", description: "Manage a channel's broadcast configuration", endpoints: ["Modify Channel Information", "Create Stream Marker"], category: "Channel" },
  { id: "channel:manage:moderators", name: "channel:manage:moderators", description: "Add or remove the moderator role from users", endpoints: ["Add/Remove Channel Moderator"], category: "Channel" },
  { id: "channel:manage:vips", name: "channel:manage:vips", description: "Add or remove the VIP role from users", endpoints: ["Add/Remove Channel VIP"], category: "Channel" },
  { id: "channel:read:vips", name: "channel:read:vips", description: "Read the list of VIPs in your channel", endpoints: ["Get VIPs"], category: "Channel" },
  { id: "channel:read:editors", name: "channel:read:editors", description: "View a list of users with the editor role", endpoints: ["Get Channel Editors"], category: "Channel" },
  { id: "channel:read:subscriptions", name: "channel:read:subscriptions", description: "View a list of all subscribers to a channel", endpoints: ["Get Broadcaster Subscriptions"], category: "Channel" },
  { id: "channel:read:goals", name: "channel:read:goals", description: "View Creator Goals for a channel", endpoints: ["Get Creator Goals"], category: "Channel" },
  { id: "channel:read:hype_train", name: "channel:read:hype_train", description: "View Hype Train information for a channel", endpoints: ["Get Hype Train Events"], category: "Channel" },
  { id: "channel:read:polls", name: "channel:read:polls", description: "View a channel's polls", endpoints: ["Get Polls"], category: "Channel" },
  { id: "channel:manage:polls", name: "channel:manage:polls", description: "Manage a channel's polls", endpoints: ["Create Poll", "End Poll"], category: "Channel" },
  { id: "channel:read:predictions", name: "channel:read:predictions", description: "View a channel's Channel Points Predictions", endpoints: ["Get Predictions"], category: "Channel" },
  { id: "channel:manage:predictions", name: "channel:manage:predictions", description: "Manage channel's Channel Points Predictions", endpoints: ["Create/End Prediction"], category: "Channel" },
  { id: "channel:read:redemptions", name: "channel:read:redemptions", description: "View Channel Points custom rewards and their redemptions", endpoints: ["Get Custom Reward"], category: "Channel" },
  { id: "channel:manage:redemptions", name: "channel:manage:redemptions", description: "Manage Channel Points custom rewards", endpoints: ["Create/Update Custom Rewards"], category: "Channel" },
  { id: "channel:manage:schedule", name: "channel:manage:schedule", description: "Manage a channel's stream schedule", endpoints: ["Update Channel Stream Schedule"], category: "Channel" },
  { id: "channel:read:stream_key", name: "channel:read:stream_key", description: "View an authorized user's stream key", endpoints: ["Get Stream Key"], category: "Channel" },
  { id: "channel:manage:videos", name: "channel:manage:videos", description: "Manage a channel's videos, including deleting videos", endpoints: ["Delete Videos"], category: "Channel" },
  { id: "channel:read:ads", name: "channel:read:ads", description: "Read the ads schedule and details on your channel", endpoints: ["Get Ad Schedule"], category: "Channel" },
  { id: "channel:manage:ads", name: "channel:manage:ads", description: "Manage ads schedule on a channel", endpoints: ["Snooze Next Ad"], category: "Channel" },
  { id: "channel:edit:commercial", name: "channel:edit:commercial", description: "Run commercials on a channel", endpoints: ["Start Commercial"], category: "Channel" },
  { id: "channel:manage:raids", name: "channel:manage:raids", description: "Manage a channel raiding another channel", endpoints: ["Start/Cancel Raid"], category: "Channel" },
  { id: "channel:read:charity", name: "channel:read:charity", description: "Read charity campaign details", endpoints: ["Get Charity Campaign"], category: "Channel" },
  { id: "channel:manage:extensions", name: "channel:manage:extensions", description: "Manage a channel's Extension configuration", endpoints: ["Update User Extensions"], category: "Channel" },
  { id: "channel:read:guest_star", name: "channel:read:guest_star", description: "Read Guest Star details for your channel", endpoints: ["Get Guest Star Settings"], category: "Channel" },
  { id: "channel:manage:guest_star", name: "channel:manage:guest_star", description: "Manage Guest Star for your channel", endpoints: ["Guest Star APIs"], category: "Channel" },
  
  // User
  { id: "user:edit", name: "user:edit", description: "Manage a user object", endpoints: ["Update User"], category: "User" },
  { id: "user:read:email", name: "user:read:email", description: "View a user's email address", endpoints: ["Get Users"], category: "User" },
  { id: "user:read:follows", name: "user:read:follows", description: "View the list of channels a user follows", endpoints: ["Get Followed Channels"], category: "User" },
  { id: "user:read:subscriptions", name: "user:read:subscriptions", description: "View if an authorized user is subscribed to specific channels", endpoints: ["Check User Subscription"], category: "User" },
  { id: "user:read:blocked_users", name: "user:read:blocked_users", description: "View the block list of a user", endpoints: ["Get User Block List"], category: "User" },
  { id: "user:manage:blocked_users", name: "user:manage:blocked_users", description: "Manage the block list of a user", endpoints: ["Block/Unblock User"], category: "User" },
  { id: "user:read:broadcast", name: "user:read:broadcast", description: "View a user's broadcasting configuration", endpoints: ["Get Stream Markers"], category: "User" },
  { id: "user:edit:broadcast", name: "user:edit:broadcast", description: "View and edit a user's broadcasting configuration", endpoints: ["Update User Extensions"], category: "User" },
  { id: "user:manage:chat_color", name: "user:manage:chat_color", description: "Update the color used for the user's name in chat", endpoints: ["Update User Chat Color"], category: "User" },
  { id: "user:read:emotes", name: "user:read:emotes", description: "View emotes available to a user", endpoints: ["Get User Emotes"], category: "User" },
  { id: "user:read:moderated_channels", name: "user:read:moderated_channels", description: "Read the list of channels you have moderator privileges in", endpoints: ["Get Moderated Channels"], category: "User" },
  { id: "user:read:whispers", name: "user:read:whispers", description: "Receive whispers sent to your user", endpoints: ["Whisper Received event"], category: "User" },
  { id: "user:manage:whispers", name: "user:manage:whispers", description: "Send whispers on your user's behalf", endpoints: ["Send Whisper"], category: "User" },
  
  // Bits & Analytics
  { id: "bits:read", name: "bits:read", description: "View Bits information for a channel", endpoints: ["Get Bits Leaderboard", "Channel Cheer event"], category: "Bits & Analytics" },
  { id: "analytics:read:extensions", name: "analytics:read:extensions", description: "View analytics data for the Twitch Extensions owned by the authenticated account", endpoints: ["Get Extension Analytics"], category: "Bits & Analytics" },
  { id: "analytics:read:games", name: "analytics:read:games", description: "View analytics data for the games owned by the authenticated account", endpoints: ["Get Game Analytics"], category: "Bits & Analytics" },
  
  // Clips
  { id: "clips:edit", name: "clips:edit", description: "Manage Clips for a channel", endpoints: ["Create Clip"], category: "Clips" },
  { id: "channel:manage:clips", name: "channel:manage:clips", description: "Manage Clips for a channel including from VOD", endpoints: ["Create Clip From VOD"], category: "Clips" },
];

// Default recommended scopes for chat functionality
const DEFAULT_SCOPES = ["chat:read", "chat:edit", "user:read:chat", "user:write:chat"];

export function SetupView(props: SetupViewProps) {
  const [clientId, setClientId] = createSignal("");
  const [clientSecret, setClientSecret] = createSignal("");
  const [status, setStatus] = createSignal<SetupStatus | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [saveSuccess, setSaveSuccess] = createSignal(false);
  const [authUrl, setAuthUrl] = createSignal<string | null>(null);
  const [linkCopied, setLinkCopied] = createSignal(false);
  const [selectedScopes, setSelectedScopes] = createSignal<Set<string>>(new Set(DEFAULT_SCOPES));
  const [callbackUrl, setCallbackUrl] = createSignal<string | null>(null);
  const [scopeFilter, setScopeFilter] = createSignal("");
  const [authUrlRevealed, setAuthUrlRevealed] = createSignal(false);
  const [callbackUrlRevealed, setCallbackUrlRevealed] = createSignal(false);

  // Group scopes by category
  const scopesByCategory = () => {
    const filter = scopeFilter().toLowerCase();
    const filtered = filter
      ? TWITCH_SCOPES.filter(s => 
          s.name.toLowerCase().includes(filter) || 
          s.description.toLowerCase().includes(filter) ||
          s.category.toLowerCase().includes(filter)
        )
      : TWITCH_SCOPES;
    
    return filtered.reduce((acc, scope) => {
      if (!acc[scope.category]) acc[scope.category] = [];
      acc[scope.category].push(scope);
      return acc;
    }, {} as Record<string, ScopeInfo[]>);
  };

  const loadStatus = async () => {
    try {
      const s = await getSetupStatus();
      setStatus(s);
      // Username comes from authStore (set by StatusBar or after OAuth/logout)
    } catch (e) {
      console.error("Failed to get setup status:", e);
    }
  };

  const loadScopes = async () => {
    try {
      const savedScopes = await getTwitchScopes();
      if (savedScopes.length > 0) {
        setSelectedScopes(new Set(savedScopes));
      }
    } catch (e) {
      console.error("Failed to load saved scopes:", e);
      // Keep default scopes on error
    }
  };

  onMount(() => {
    loadStatus();
    loadScopes();
  });

  // Handle callback URL paste
  createEffect(() => {
    const url = callbackUrl();
    if (url && url.includes("code=")) {
      handleCallbackUrl(url);
    }
  });

  const handleSave = async () => {
    setError(null);
    setSaveSuccess(false);
    setSaving(true);

    try {
      await saveTwitchCredentials(clientId(), clientSecret());
      setSaveSuccess(true);
      setClientId("");
      setClientSecret("");
      await loadStatus();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to save credentials");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateLink = async () => {
    setError(null);
    props.onOauthStatusChange?.(null);

    try {
      const scopes = Array.from(selectedScopes());
      
      // Save scopes for future use
      await saveTwitchScopes(scopes);
      
      const { url } = await getTwitchAuthUrl(scopes);
      setAuthUrl(url);
      await writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to generate auth link");
    }
  };

  const handleCallbackUrl = async (url: string) => {
    setError(null);
    props.onOauthStatusChange?.("Exchanging authorization code...");

    try {
      const parsedUrl = new URL(url);
      const code = parsedUrl.searchParams.get("code");
      const state = parsedUrl.searchParams.get("state");
      const errorParam = parsedUrl.searchParams.get("error");

      if (errorParam) {
        const errorDesc = parsedUrl.searchParams.get("error_description") || errorParam;
        props.onOauthStatusChange?.(`Authorization failed: ${errorDesc}`);
        setCallbackUrl(null);
        return;
      }

      if (!code || !state) {
        setError("Invalid callback URL - missing code or state parameter");
        setCallbackUrl(null);
        return;
      }

      const scopes = Array.from(selectedScopes());
      const result = await exchangeTwitchCode(code, state, scopes);
      
      if (result.success) {
        props.onOauthStatusChange?.(`Successfully authorized as ${result.username}`);
        setTwitchUsername(result.username ?? null); // update shared store
        setAuthUrl(null);
        setCallbackUrl(null);
        await loadStatus();
      } else {
        props.onOauthStatusChange?.(`Authorization failed: ${result.message}`);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      props.onOauthStatusChange?.(`Authorization failed: ${err.message ?? e}`);
    }
  };

  const handleLogout = async () => {
    setError(null);
    try {
      await logoutTwitch();
      setTwitchUsername(null); // clear shared store
      setAuthUrl(null);
      props.onOauthStatusChange?.(null);
      await loadStatus();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to logout");
    }
  };

  const toggleScope = (scopeId: string) => {
    setSelectedScopes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(scopeId)) {
        newSet.delete(scopeId);
      } else {
        newSet.add(scopeId);
      }
      return newSet;
    });
    // Clear generated URL when scopes change
    setAuthUrl(null);
  };

  const selectAllInCategory = (category: string) => {
    const categoryScopes = TWITCH_SCOPES.filter(s => s.category === category);
    setSelectedScopes(prev => {
      const newSet = new Set(prev);
      categoryScopes.forEach(s => newSet.add(s.id));
      return newSet;
    });
    setAuthUrl(null);
  };

  const deselectAllInCategory = (category: string) => {
    const categoryScopes = TWITCH_SCOPES.filter(s => s.category === category);
    setSelectedScopes(prev => {
      const newSet = new Set(prev);
      categoryScopes.forEach(s => newSet.delete(s.id));
      return newSet;
    });
    setAuthUrl(null);
  };

  // Update state when oauth completes externally
  onMount(() => {
    const oauthStatus = props.oauthStatus;
    if (oauthStatus && oauthStatus.includes("Successfully")) {
      loadStatus();
      setAuthUrl(null);
    }
  });

  return (
    <div class="flex flex-col items-center justify-start h-full p-8 overflow-auto">
      <div class="w-full max-w-2xl space-y-6">
        <div class="text-center space-y-2">
          <h2 class="text-text-primary font-medium text-2xl">Bruh Setup</h2>
          <p class="text-text-secondary">
            Configure your Twitch API credentials to get started
          </p>
        </div>

        {/* Twitch Credentials Section */}
        <div class="bg-bg-secondary rounded-lg p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-text-primary font-medium">Twitch Credentials</h3>
            <Show when={status()}>
              <span
                class={`text-xs px-2 py-1 rounded ${
                  status()!.credentialsConfigured
                    ? "bg-success/20 text-success"
                    : "bg-warning/20 text-warning"
                }`}
              >
                {status()!.credentialsConfigured ? "Configured" : "Not Configured"}
              </span>
            </Show>
          </div>

          <p class="text-text-secondary text-sm">
            Create an application at the{" "}
            <a
              href="https://dev.twitch.tv/console/apps"
              target="_blank"
              rel="noopener noreferrer"
              class="text-accent hover:text-accent-hover underline"
            >
              Twitch Developer Console
            </a>{" "}
            to get your Client ID and Client Secret.
          </p>

          <p class="text-text-tertiary text-xs bg-bg-tertiary rounded p-2">
            <strong>OAuth Redirect URL:</strong> http://localhost:1420/callback
          </p>

          <div class="space-y-3">
            <div>
              <label class="block text-text-secondary text-sm mb-1">
                Client ID
              </label>
              <input
                type="text"
                value={clientId()}
                onInput={(e) => setClientId(e.currentTarget.value)}
                placeholder="Enter your Twitch Client ID"
                class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label class="block text-text-secondary text-sm mb-1">
                Client Secret
              </label>
              <input
                type="password"
                value={clientSecret()}
                onInput={(e) => setClientSecret(e.currentTarget.value)}
                placeholder="Enter your Twitch Client Secret"
                class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving() || !clientId() || !clientSecret()}
              class="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors cursor-pointer"
            >
              {saving() ? "Saving..." : "Save Credentials"}
            </button>
          </div>
        </div>

        {/* User Authorization Section */}
        <Show when={status()?.credentialsConfigured}>
          <div class="bg-bg-secondary rounded-lg p-6 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-text-primary font-medium">User Authorization</h3>
              <Show when={status()}>
                <span
                  class={`text-xs px-2 py-1 rounded ${
                    status()!.userAuthorized
                      ? "bg-success/20 text-success"
                      : "bg-warning/20 text-warning"
                  }`}
                >
                  {status()!.userAuthorized ? "Authorized" : "Not Authorized"}
                </span>
              </Show>
            </div>

            <Show when={twitchUsername()}>
              <div class="flex items-center gap-2 text-text-secondary">
                <span>Logged in as:</span>
                <span class="text-text-primary font-medium">{twitchUsername()}</span>
              </div>
            </Show>

            <div class="bg-warning/10 border border-warning/30 rounded p-3 text-warning text-sm">
              <strong>Important:</strong> Make sure you are logged into Twitch in your browser as the user you want to authenticate before pasting the link.
            </div>

            {/* Scope Selection */}
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <label class="text-text-secondary text-sm font-medium">
                  Select Scopes ({selectedScopes().size} selected)
                </label>
                <input
                  type="text"
                  placeholder="Filter scopes..."
                  value={scopeFilter()}
                  onInput={(e) => setScopeFilter(e.currentTarget.value)}
                  class="text-xs bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent w-40"
                />
              </div>
              
              <div class="max-h-64 overflow-y-auto bg-bg-tertiary rounded border border-border">
                <For each={Object.entries(scopesByCategory())}>
                  {([category, scopes]) => (
                    <div class="border-b border-border last:border-b-0">
                      <div class="flex items-center justify-between px-3 py-2 bg-bg-secondary/50 sticky top-0">
                        <span class="text-text-primary text-xs font-medium">{category}</span>
                        <div class="flex gap-2">
                          <button
                            onClick={() => selectAllInCategory(category)}
                            class="text-xs text-accent hover:text-accent-hover"
                          >
                            All
                          </button>
                          <button
                            onClick={() => deselectAllInCategory(category)}
                            class="text-xs text-text-tertiary hover:text-text-secondary"
                          >
                            None
                          </button>
                        </div>
                      </div>
                      <For each={scopes}>
                        {(scope) => (
                          <label
                            class="flex items-start gap-2 px-3 py-1.5 hover:bg-bg-secondary/30 cursor-pointer group"
                            title={`${scope.description}\n\nEndpoints: ${scope.endpoints.join(", ")}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedScopes().has(scope.id)}
                              onChange={() => toggleScope(scope.id)}
                              class="mt-0.5 accent-accent"
                            />
                            <div class="flex-1 min-w-0">
                              <div class="text-text-primary text-xs font-mono">{scope.name}</div>
                              <div class="text-text-tertiary text-xs truncate group-hover:whitespace-normal">
                                {scope.description}
                              </div>
                            </div>
                          </label>
                        )}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            </div>

            <div class="flex gap-3 pt-2">
              <button
                onClick={handleGenerateLink}
                disabled={selectedScopes().size === 0}
                class="flex-1 bg-[#9146FF] hover:bg-[#7c3ae6] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors cursor-pointer"
              >
                {linkCopied() ? "Link Copied!" : "Generate & Copy Auth Link"}
              </button>
              <Show when={status()?.userAuthorized}>
                <button
                  onClick={handleLogout}
                  class="bg-bg-tertiary hover:bg-border text-text-primary font-medium py-2 px-4 rounded border border-border transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </Show>
            </div>

            <Show when={authUrl()}>
              <div class="space-y-3 pt-2">
                <div
                  onClick={async () => {
                    await writeText(authUrl()!);
                    setAuthUrlRevealed(true);
                    setTimeout(() => setAuthUrlRevealed(false), 2000);
                  }}
                  class={`text-xs text-text-tertiary bg-bg-tertiary p-2 rounded break-all font-mono cursor-pointer hover:bg-bg-secondary transition-all ${
                    authUrlRevealed() ? "select-all" : "blur-sm hover:blur-[2px]"
                  }`}
                  title="Click to copy and reveal"
                >
                  {authUrl()}
                </div>
                <p class="text-text-tertiary text-xs italic">
                  Click the URL above to copy it to clipboard
                </p>
                <ol class="text-text-secondary text-sm list-decimal list-inside space-y-1">
                  <li>Open your browser</li>
                  <li>Paste the link into the address bar</li>
                  <li>Authorize the application on Twitch</li>
                  <li>Copy the full URL from your browser after being redirected</li>
                  <li>Paste it below to complete authorization</li>
                </ol>

                <div>
                  <label class="block text-text-secondary text-sm mb-1">
                    Paste Callback URL
                  </label>
                  <div class="relative">
                    <input
                      type="text"
                      value={callbackUrl() ?? ""}
                      onInput={(e) => setCallbackUrl(e.currentTarget.value)}
                      onFocus={() => setCallbackUrlRevealed(true)}
                      onBlur={() => setCallbackUrlRevealed(false)}
                      placeholder="http://localhost:1420/callback?code=...&state=..."
                      class={`w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent font-mono text-xs transition-all ${
                        callbackUrl() && !callbackUrlRevealed() ? "blur-sm" : ""
                      }`}
                    />
                  </div>
                  <p class="text-text-tertiary text-xs mt-1 italic">
                    Contains sensitive authorization code - blurred for privacy
                  </p>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        {/* Status Messages */}
        <Show when={saveSuccess()}>
          <div class="bg-success/10 border border-success/30 rounded-lg p-4 text-success">
            Credentials saved successfully!
          </div>
        </Show>

        <Show when={props.oauthStatus}>
          <div
            class={`rounded-lg p-4 ${
              props.oauthStatus!.includes("Successfully")
                ? "bg-success/10 border border-success/30 text-success"
                : props.oauthStatus!.includes("failed")
                ? "bg-error/10 border border-error/30 text-error"
                : "bg-accent/10 border border-accent/30 text-accent"
            }`}
          >
            {props.oauthStatus}
          </div>
        </Show>

        <Show when={error()}>
          <div class="bg-error/10 border border-error/30 rounded-lg p-4 text-error">
            {error()}
          </div>
        </Show>
      </div>
    </div>
  );
}
