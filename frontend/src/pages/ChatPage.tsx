import { ChatBubble } from "../components/chat/ChatBubble";
import { ChatComposer } from "../components/chat/ChatComposer";
import { GlassCard } from "../components/chat/GlassCard";
import { IconBtn } from "../components/chat/IconBtn";
import { cn } from "../utils/cn";
import { GLASS_BAR } from "../ui/glassTokens";

const messages = [
  {
    id: 1,
    variant: "in" as const,
    message: "Привет! Ты видел новые фичи по стеклу?",
    time: "12:04",
  },
  {
    id: 2,
    variant: "out" as const,
    message: "Да, хочу, чтобы чат выглядел как тонкое стекло, без лишнего шума.",
    time: "12:05",
  },
  {
    id: 3,
    variant: "in" as const,
    message: "Сделаем минимально и в тёмной гамме, как в Telegram.",
    time: "12:06",
  },
  {
    id: 4,
    variant: "out" as const,
    message: "Отлично. Пусть все элементы читаются, но не отвлекают.",
    time: "12:07",
  },
];

export const ChatPage = () => (
  <div className="min-h-screen bg-gradient-to-br from-[#0a0b10] via-[#0b0f1a] to-[#06070c] text-white">
    <div className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-8">
      <GlassCard className="w-full">
        <div
          className={cn(
            "flex items-center justify-between gap-4 px-4 py-3 border-b",
            GLASS_BAR
          )}
        >
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-white/10" />
            <div>
              <div className="text-sm font-semibold">Алиса Воронова</div>
              <div className="text-xs text-white/55">в сети</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IconBtn title="Поиск">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <circle cx="11" cy="11" r="6" />
                <path d="M16.5 16.5L21 21" />
              </svg>
            </IconBtn>
            <IconBtn title="Инфо">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M12 17v-5" />
                <circle cx="12" cy="7" r="1" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </IconBtn>
          </div>
        </div>

        <div className="glass-scroll max-h-[520px] space-y-3 overflow-auto px-4 py-4">
          {messages.map((message) => (
            <ChatBubble key={message.id} {...message} />
          ))}
        </div>

        <div className={cn("px-4 py-3 border-t", GLASS_BAR)}>
          <ChatComposer />
        </div>
      </GlassCard>
    </div>
  </div>
);
