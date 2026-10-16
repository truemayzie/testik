export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startGenerationReconciler } = await import("@/lib/generationReconciler");
    startGenerationReconciler();
    const { startAbandonedOrderRecovery } = await import("@/lib/abandonedOrderRecovery");
    startAbandonedOrderRecovery();
  }
}
