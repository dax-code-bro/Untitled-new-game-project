import { useEffect, useRef } from "react";
import { initGame } from "../game/engine";

export default function Game() {
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const cleanup = initGame(canvasRef.current);
    return cleanup;
  }, []);

  return (
    <div
      ref={canvasRef}
      style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#000", cursor: "none" }}
    />
  );
}
