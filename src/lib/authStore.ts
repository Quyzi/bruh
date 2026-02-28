import { createSignal } from "solid-js";

/** Shared Twitch username from the last successful validation. Only StatusBar (and SetupView after OAuth/logout) updates this to avoid duplicate validation calls. */
const [twitchUsername, setTwitchUsername] = createSignal<string | null>(null);

export { twitchUsername, setTwitchUsername };
