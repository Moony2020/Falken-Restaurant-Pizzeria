"use client";

import { CheckIcon } from "@/components/icons";
import { useOrder } from "./order-provider";

export function Toast() {
  const { notice } = useOrder();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 sm:bottom-8">
      {notice && (
        <p className="flex animate-rise items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm text-ivory shadow-xl">
          <CheckIcon className="size-4 text-gold" />
          {notice}
        </p>
      )}
    </div>
  );
}
