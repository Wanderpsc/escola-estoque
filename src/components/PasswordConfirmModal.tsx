"use client";

import { useState, useRef } from "react";
import { KeyRound, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** Texto descritivo da ação que será executada após confirmar */
  actionLabel: string;
  /** Chamado quando a senha está correta. Pode ser async. */
  onConfirmed: () => void | Promise<void>;
  /** Chamado quando o usuário cancela */
  onClose: () => void;
}

/**
 * Modal reutilizável de confirmação por senha.
 * Chama POST /api/auth/verify e invoca onConfirmed() se ok.
 */
export default function PasswordConfirmModal({ actionLabel, onConfirmed, onClose }: Props) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleConfirm() {
    if (!password.trim()) { setError("Digite sua senha"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Aguarda a acao assincrona antes de fechar
        await Promise.resolve(onConfirmed());
      } else {
        const data = await res.json();
        setError(data.error ?? "Senha incorreta");
        setPassword("");
        inputRef.current?.focus();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-sm">Confirmação de identidade</p>
            <p className="text-xs text-slate-500 mt-0.5">Para {actionLabel}, confirme sua senha</p>
          </div>
        </div>

        <div className="relative mb-2">
          <input
            ref={inputRef}
            autoFocus
            type={show ? "text" : "password"}
            autoComplete="off"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            placeholder="Sua senha de acesso"
            className={`w-full border-2 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none transition-colors ${
              error ? "border-red-400 focus:border-red-500" : "border-slate-300 focus:border-blue-500"
            }`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !password.trim()}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {loading ? "Verificando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
