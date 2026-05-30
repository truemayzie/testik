import { Suspense } from "react";
import OrderBootstrap from "./OrderBootstrap";

export const dynamic = "force-dynamic";

export default function OrderPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "50vh", display: "grid", placeItems: "center", color: "#64748b" }}>
          Загрузка…
        </div>
      }
    >
      <OrderBootstrap />
    </Suspense>
  );
}
