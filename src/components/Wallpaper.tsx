"use client";

import React, { useEffect, useState } from "react";
import { useOS } from "@/store/os";
import { useFS } from "@/lib/fs";
import { WallpaperById } from "./wallpapers";

/**
 * The active wallpaper: a built-in original scene, or a photo the user
 * picked (Photos → Set as Wallpaper), rendered from its stored blob.
 */
export function ActiveWallpaper() {
  const wallpaper = useOS((s) => s.wallpaper);
  const customId = useOS((s) => s.customWallpaperId);
  const node = useFS((s) => (customId ? s.nodes[customId] : undefined));
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!node?.blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(node.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [node]);

  if (customId && node?.blob && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        data-testid="custom-wallpaper-img"
        className="h-full w-full object-cover"
        draggable={false}
      />
    );
  }
  return <WallpaperById id={wallpaper} />;
}
