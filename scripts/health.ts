try {
  const state = await Bun.file(
    process.env.HEALTH_PATH || "/tmp/rl-tracker-health.json",
  ).json();
  process.exit(state.connected && Date.now() - state.at < 30000 ? 0 : 1);
} catch {
  process.exit(1);
}
export {};
