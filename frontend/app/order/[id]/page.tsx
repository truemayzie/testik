import { Suspense } from "react";
import OrderPageClient from "../OrderPageClient";

export const dynamic = "force-dynamic";

export default function OrderByIdPage({ params }: { params: { id: string } }) {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "50vh", display: "grid", placeItems: "center", color: "#64748b" }}>
          Загрузка…
        </div>
      }
    >
      <OrderPageClient taskId={params.id} />
    </Suspense>
  );
}
