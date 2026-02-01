import { LiteGraph } from "litegraph.js";

export function TwitchEventNode(this: any) {
  this.addOutput("event", LiteGraph.EVENT);
  this.addOutput("data", "object");
  this.properties = { eventType: "channel.follow" };
  this.addWidget("combo", "Event Type", this.properties.eventType, (v: string) => {
    this.properties.eventType = v;
  }, {
    values: [
      "channel.follow",
      "channel.subscribe",
      "channel.subscription.gift",
      "channel.cheer",
      "channel.raid",
      "channel.channel_points_custom_reward_redemption.add",
      "stream.online",
      "stream.offline",
    ]
  });
}

TwitchEventNode.prototype.onExecute = function() {
  // Placeholder - will be triggered by actual events
};

TwitchEventNode.title = "Twitch Event";
TwitchEventNode.desc = "Triggers on Twitch EventSub events";

export function register() {
  LiteGraph.registerNodeType("twitch/event", TwitchEventNode as any);
}
