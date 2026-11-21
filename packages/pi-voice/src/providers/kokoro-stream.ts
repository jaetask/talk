import type { SpeakOptions, TtsProvider } from "../tts.ts";

export type KokoroStreamOptions = {
  url?: string;
  engine?: string;
  voice?: string;
  sampleRate?: number;
};

export function kokoroStream(options: KokoroStreamOptions = {}): TtsProvider {
  const url = options.url ?? "ws://127.0.0.1:3900/ws/tts";
  let socket: WebSocket | undefined;
  let opening: Promise<WebSocket> | undefined;
  const open = (): Promise<WebSocket> => {
    if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
    opening ??= new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        socket = ws;
        opening = undefined;
        resolve(ws);
      };
      ws.onerror = () => {
        opening = undefined;
        reject(new Error(`kokoro: couldn't reach the speech server at ${url}`));
      };
      ws.onclose = () => {
        if (socket === ws) socket = undefined;
      };
    });
    return opening;
  };
  return {
    name: "kokoro",
    sampleRate: options.sampleRate ?? 24000,
    async *synthesize(text: string, speak: SpeakOptions = {}) {
      const ws = await open();
      const queue: (Uint8Array | Error | null)[] = [];
      let wake: () => void = () => {};
      const push = (item: Uint8Array | Error | null) => {
        queue.push(item);
        wake();
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return push(new Uint8Array(e.data as ArrayBuffer));
        const m = JSON.parse(e.data);
        if (m.type === "error")
          push(new Error(`kokoro: ${m.detail ?? "the speech server failed"}`));
        else if (m.type === "done") push(null);
      };
      const closed = () => push(new Error("kokoro: the speech server closed the connection"));
      ws.addEventListener("close", closed);
      const abort = () => {
        ws.close();
        push(null);
      };
      speak.signal?.addEventListener("abort", abort);
      try {
        ws.send(
          JSON.stringify({
            text,
            engine: options.engine ?? "mlx-audio",
            speed: speak.speed ?? 1,
            voice: speak.voice ?? options.voice ?? "af_heart",
          }),
        );
        for (;;) {
          while (!queue.length)
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          const item = queue.shift()!;
          if (item === null) return;
          if (item instanceof Error) throw item;
          yield item;
        }
      } finally {
        ws.removeEventListener("close", closed);
        speak.signal?.removeEventListener("abort", abort);
      }
    },
    close() {
      socket?.close();
      socket = undefined;
    },
  };
}
