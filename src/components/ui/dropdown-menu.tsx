"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  sideOffset = 8,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <AnimatePresence>
        <DropdownMenuPrimitive.Content
          data-slot="dropdown-menu-content"
          sideOffset={sideOffset}
          asChild
          className={cn(
            "z-[300] min-w-[220px] overflow-hidden rounded-xl border bg-white p-1.5 text-sm shadow-lg",
            className
          )}
          {...props}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ type: "spring", stiffness: 400, damping: 30, duration: 0.15 }}
          >
            {children}
          </motion.div>
        </DropdownMenuPrimitive.Content>
      </AnimatePresence>
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn("px-2 py-1.5 text-sm font-medium", className)}
      {...props}
    />
  )
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 text-sm outline-none",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator(props: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className="my-1 h-px bg-border" {...props} />
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      checked={checked}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default select-none items-center rounded-md py-2 pr-2 pl-8 text-sm outline-none",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuSubTrigger({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground flex cursor-default select-none items-center rounded-md px-2 py-2 text-sm outline-none",
        className
      )}
      {...props}
    >
      {props.children}
      <ChevronRight className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn("z-[300] min-w-[180px] rounded-xl border bg-white p-1.5 shadow-lg", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
