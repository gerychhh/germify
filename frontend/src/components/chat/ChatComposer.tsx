import { cn } from "../../utils/cn";
import {
  COMPOSER_INPUT,
  COMPOSER_ROW,
  COMPOSER_SEND,
  PLACEHOLDER,
} from "../../ui/glassTokens";

type ChatComposerProps = {
  placeholder?: string;
};

export const ChatComposer = ({ placeholder = "Сообщение" }: ChatComposerProps) => (
  <div className={cn(COMPOSER_ROW, "flex items-center gap-2")}
  >
    <input
      type="text"
      placeholder={placeholder}
      className={cn(COMPOSER_INPUT, PLACEHOLDER)}
    />
    <button type="button" className={COMPOSER_SEND}>
      Отправить
    </button>
  </div>
);
