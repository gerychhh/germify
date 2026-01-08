import type { ReactNode } from "react";

import { cn } from "../../utils/cn";
import {
  ICON_BTN_ACTIVE,
  ICON_BTN_BASE,
  ICON_BTN_HOVER,
} from "../../ui/glassTokens";

type IconBtnProps = {
  title: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
};

export const IconBtn = ({ title, onClick, active, children }: IconBtnProps) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={cn(ICON_BTN_BASE, ICON_BTN_HOVER, active && ICON_BTN_ACTIVE)}
  >
    {children}
  </button>
);
