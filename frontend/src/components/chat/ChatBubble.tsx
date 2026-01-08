import { cn } from "../../utils/cn";
import {
  BUBBLE_BASE,
  BUBBLE_IN,
  BUBBLE_OUT,
  BUBBLE_TIMESTAMP,
  GLASS_HOVER,
  GLASS_HOVER_STRONG,
  INSET_HIGHLIGHT,
  TEXT_MUTED,
} from "../../ui/glassTokens";

type ChatBubbleProps = {
  variant: "in" | "out";
  message: string;
  time: string;
};

export const ChatBubble = ({ variant, message, time }: ChatBubbleProps) => {
  const isOutgoing = variant === "out";

  return (
    <div
      className={cn(
        "flex",
        isOutgoing ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(BUBBLE_BASE, isOutgoing ? BUBBLE_OUT : BUBBLE_IN, isOutgoing ? GLASS_HOVER_STRONG : GLASS_HOVER, isOutgoing && INSET_HIGHLIGHT)}>
        <div className="leading-relaxed">{message}</div>
        <div
          className={cn(
            BUBBLE_TIMESTAMP,
            TEXT_MUTED,
            "mt-1",
            isOutgoing ? "text-right" : "text-left"
          )}
        >
          {time}
        </div>
      </div>
    </div>
  );
};
