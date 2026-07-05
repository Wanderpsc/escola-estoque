"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Camera, CameraOff, Barcode, Loader2 } from "lucide-react";

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void;
  onClose: () => void;
  title?: string;
}

// BarcodeDetector é nativo em Chrome/Edge/Android. Fallback = input manual.
declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string; format: string }>>;
  static getSupportedFormats(): Promise<string[]>;
}

export default function BarcodeScanner({ onDetected, onClose, title = "Escanear Código de Barras" }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);

  const [mode, setMode] = useState<"loading" | "camera" | "manual" | "unsupported">("loading");
  const [manualCode, setManualCode] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastDetected, setLastDetected] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  const startScanning = useCallback(async () => {
    if (!detectorRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    intervalRef.current = setInterval(async () => {
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      try {
        const results = await detectorRef.current!.detect(canvas);
        if (results.length > 0) {
          const value = results[0].rawValue;
          setLastDetected(value);
          stopCamera();
          onDetected(value);
        }
      } catch {
        // silencioso — frame sem barcode
      }
    }, 300);
  }, [onDetected, stopCamera]);

  useEffect(() => {
    async function init() {
      // 1. Verificar suporte ao BarcodeDetector
      const hasDetector = "BarcodeDetector" in window;
      if (!hasDetector) {
        setMode("manual");
        return;
      }

      try {
        const formats = await (window as any).BarcodeDetector.getSupportedFormats();
        const wanted = formats.filter((f: string) =>
          ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"].includes(f)
        );
        detectorRef.current = new (window as any).BarcodeDetector({ formats: wanted.length ? wanted : formats });
      } catch {
        setMode("manual");
        return;
      }

      // 2. Abrir câmera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current!.play();
            setMode("camera");
            startScanning();
          };
        }
      } catch (err: any) {
        const msg = err?.name === "NotAllowedError"
          ? "Permissão de câmera negada. Ative nas configurações do navegador."
          : "Câmera indisponível neste dispositivo.";
        setCameraError(msg);
        setMode("manual");
      }
    }

    init();
    return () => stopCamera();
  }, [startScanning, stopCamera]);

  function handleManualSubmit() {
    const code = manualCode.trim();
    if (!code) return;
    onDetected(code);
  }

  function switchToManual() {
    stopCamera();
    setMode("manual");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Barcode className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          </div>
          <button onClick={() => { stopCamera(); onClose(); }} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading */}
        {mode === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm">Iniciando câmera...</p>
          </div>
        )}

        {/* Camera view */}
        {mode === "camera" && (
          <div className="relative bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-video object-cover"
            />
            {/* Overlay de mira */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-28 border-2 border-blue-400 rounded-lg relative">
                <div className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-4 border-l-4 border-blue-400 rounded-tl" />
                <div className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-4 border-r-4 border-blue-400 rounded-tr" />
                <div className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-4 border-l-4 border-blue-400 rounded-bl" />
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-4 border-r-4 border-blue-400 rounded-br" />
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-blue-400/60 animate-pulse" />
              </div>
            </div>
            <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/80">
              Aponte para o código de barras do produto
            </p>
          </div>
        )}

        {/* Canvas oculto para processamento */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Modo manual */}
        {mode === "manual" && (
          <div className="p-5 space-y-4">
            {cameraError && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800 flex gap-2">
                <CameraOff className="w-4 h-4 shrink-0 mt-0.5" />
                {cameraError}
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Digite ou cole o código de barras</label>
              <input
                autoFocus
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                placeholder="Ex: 7891234567890"
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-lg font-mono tracking-widest focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">Pressione Enter ou clique em Confirmar</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          {mode === "camera" && (
            <button
              onClick={switchToManual}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-50"
            >
              <Barcode className="w-4 h-4" />
              Digitar codigo
            </button>
          )}
          {mode === "manual" && (
            <>
              {!cameraError && "BarcodeDetector" in window && (
                <button
                  onClick={() => { setMode("loading"); setManualCode(""); window.location.reload(); }}
                  className="flex items-center gap-1 py-2.5 px-3 border border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-50"
                >
                  <Camera className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleManualSubmit}
                disabled={!manualCode.trim()}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl disabled:opacity-50"
              >
                Confirmar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
