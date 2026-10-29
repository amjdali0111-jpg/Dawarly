"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Send } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { validatePhotoFile } from "@/lib/validation";
import { useI18n } from "@/i18n/client";
import type { TKey } from "@/i18n/translate";

export interface ChatMessage {
  id: string;
  sender_id: string;
  body: string | null;
  attachment_url: string | null;
  hidden: boolean;
  created_at: string;
}

export function Chat({ conversationId, userId, initial, names, blocked, canSend }: {
  conversationId: string;
  userId: string;
  initial: ChatMessage[];
  names: Record<string, string>;
  blocked: boolean;
  canSend: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [initial.length]);

  // Live updates via Supabase Realtime (RLS-filtered), with polling as a fallback.
  useEffect(() => {
    const supabase = getBrowserSupabase();
    const channel = supabase
      .channel(`conv-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => router.refresh())
      .subscribe();
    const poll = setInterval(() => router.refresh(), 20_000);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  async function send(body: string | null, attachmentPath: string | null) {
    const supabase = getBrowserSupabase();
    const { error: e } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: userId, body, attachment_path: attachmentPath });
    if (e) throw e;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    start(async () => {
      try {
        await send(body.slice(0, 4000), null);
        setText("");
        setError(null);
        router.refresh();
      } catch {
        setError(blocked ? t("messages.blocked") : t("common.genericError"));
      }
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const bad = validatePhotoFile(file);
    if (bad) return setError(t(`errors.${bad}` as TKey));
    start(async () => {
      try {
        const blob = await compressImage(file, 1280);
        const path = `${conversationId}/${userId}/${crypto.randomUUID()}.jpg`;
        const supabase = getBrowserSupabase();
        const { error: up } = await supabase.storage.from("chat-attachments").upload(path, blob, { contentType: "image/jpeg" });
        if (up) throw up;
        await send(null, path);
        setError(null);
        router.refresh();
      } catch {
        setError(t("common.genericError"));
      }
    });
  }

  const time = (d: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(d));

  return (
    <div className="flex h-[65dvh] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {initial.length === 0 && <p className="py-10 text-center text-sm text-slate-500">{t("messages.noMessages")}</p>}
        {initial.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-teal-400 text-night-950" : "bg-night-700 text-slate-100"}`}>
                {!mine && <p className="mb-0.5 text-[11px] font-semibold opacity-70">{names[m.sender_id] ?? "—"}</p>}
                {m.hidden ? (
                  <p className="italic opacity-70">{t("messages.hidden")}</p>
                ) : (
                  <>
                    {m.attachment_url && (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.attachment_url} alt="" className="mb-1 max-h-60 rounded-lg" />
                      </a>
                    )}
                    {m.body && <p className="whitespace-pre-line break-words">{m.body}</p>}
                  </>
                )}
                <p className="mt-0.5 text-[10px] opacity-60">{time(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {error && <p className="px-3 text-sm text-red-300" role="alert">{error}</p>}
      {canSend && !blocked ? (
        <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-white/10 p-3">
          <label className="btn-ghost btn-sm cursor-pointer" aria-label={t("messages.attach")}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} disabled={sending} />
          </label>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} className="input" placeholder={t("messages.placeholder")} aria-label={t("messages.placeholder")} />
          <button type="submit" className="btn-primary btn-sm" disabled={sending || !text.trim()} aria-label={t("messages.send")}>
            <Send className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </button>
        </form>
      ) : (
        <p className="border-t border-white/10 p-3 text-center text-sm text-slate-400">{t("messages.blocked")}</p>
      )}
    </div>
  );
}
