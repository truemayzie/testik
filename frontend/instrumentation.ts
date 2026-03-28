export async function register() {
  // Запускаем мониторинг только в Node.js runtime (не в Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startHealthMonitor } = await import("./app/lib/healthMonitor");
    startHealthMonitor();
  }
}
