import { useEffect, useRef, useCallback } from "react";

/**
 * Executa `fn` imediatamente e depois a cada `intervalMs` milissegundos.
 * Para automaticamente quando o componente desmonta.
 * Não re-executa se `fn` já estiver rodando.
 */
export function usePolling(fn: () => Promise<void>, intervalMs: number) {
  const running = useRef(false);
  const savedFn = useRef(fn);

  useEffect(() => { savedFn.current = fn; }, [fn]);

  const tick = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try { await savedFn.current(); } finally { running.current = false; }
  }, []);

  useEffect(() => {
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [tick, intervalMs]);
}
