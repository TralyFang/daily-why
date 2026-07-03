"use client";

import { useEffect } from "react";

export default function ConsoleOverlay() {
  useEffect(() => {
    import("vconsole").then((mod) => {
      const VConsole = mod.default;
      new VConsole();
    });
  }, []);

  return null;
}
