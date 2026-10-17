import React from "react";
import type { Account } from "@/lib/accounts";

/**
 * An account avatar: the user's chosen color + glyph. Original and
 * abstract by design — no one's face, no vendor artwork.
 */
export default function Avatar({
  account,
  size = 40,
  fontSize,
}: {
  account: Pick<Account, "color" | "glyph" | "name">;
  size?: number;
  fontSize?: number;
}) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white shadow-md ring-2 ring-white/40"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(160deg, ${account.color}, ${account.color}b8 55%, rgba(0,0,0,0.28))`,
        fontSize: fontSize ?? Math.round(size * 0.42),
        textShadow: "0 1px 2px rgba(0,0,0,0.35)",
      }}
    >
      {account.glyph}
    </div>
  );
}
