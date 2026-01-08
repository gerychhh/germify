import { cn } from "../../utils/cn";
import { INPUT, INPUT_ROW, SEND_BTN } from "../../ui/glassTokens";

type ChatComposerProps = {
  placeholder?: string;
};

export const ChatComposer = ({ placeholder = "Сообщение" }: ChatComposerProps) => (
  <div className={cn(INPUT_ROW)}>
    <input
      type="text"
      placeholder={placeholder}
      className={cn(INPUT)}
    />
    <button type="button" className={SEND_BTN}>
      Отправить
    </button>
  </div>
);
