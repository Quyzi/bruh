export function SetupView() {
  return (
    <div class="flex flex-col items-center justify-center h-full text-text-secondary gap-4">
      <h2 class="text-text-primary font-medium text-xl">Initial Setup</h2>
      <p>Configure your Clawdia instance</p>
      <ul class="text-left list-disc list-inside">
        <li>Config generation</li>
        <li>Secrets setup</li>
        <li>Twitch authentication</li>
      </ul>
    </div>
  );
}
