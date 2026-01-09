import type { ReactNode } from "react";

import { cn } from "../../utils/cn";
import { GLASS_SURFACE } from "../../ui/glassTokens";

type GlassCardProps = {
  className?: string;
  children: ReactNode;
};

export const GlassCard = ({ className, children }: GlassCardProps) => (
  <div className={cn(GLASS_SURFACE, className)}>
    {children}
  </div>
);
