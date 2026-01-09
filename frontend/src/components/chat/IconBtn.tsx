import type { ReactNode } from "react";

import { cn } from "../../utils/cn";
import { GLASS_BTN } from "../../ui/glassTokens";

type IconBtnProps = {
  title: string;
  onClick?: () => void;
  children: ReactNode;
};

export const IconBtn = ({ title, onClick, children }: IconBtnProps) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={cn(GLASS_BTN)}
  >
    {children}
  </button>
);
