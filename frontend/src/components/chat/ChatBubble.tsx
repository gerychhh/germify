import { cn } from "../../utils/cn";
import { BUBBLE_IN, BUBBLE_OUT, TS } from "../../ui/glassTokens";

type ChatBubbleProps = {
  variant: "in" | "out";
  message: string;
  time: string;
};

export const ChatBubble = ({ variant, message, time }: ChatBubbleProps) => {
  const isOutgoing = variant === "out";

  return (
    <div className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}>
      <div className={cn(isOutgoing ? BUBBLE_OUT : BUBBLE_IN)}>
        <div className="leading-relaxed">{message}</div>
        <div
          className={cn(
            TS,
            isOutgoing ? "text-right" : "text-left"
          )}
        >
          {time}
        </div>
      </div>
    </div>
  );
};
