import { Button } from "@jaetask/toolkit/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@jaetask/toolkit/ui/tooltip";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function IconButton({
  label,
  onClick,
  children,
  pressed,
  disabled,
  tone,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  tone?: "action" | "danger";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          {...rest}
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          className={tone ? `icon-button is-${tone}` : "icon-button"}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
