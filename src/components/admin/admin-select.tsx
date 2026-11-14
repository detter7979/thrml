"use client"

import * as React from "react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

/**
 * Drop-in replacement for a native <select> in admin screens, styled like the site's dropdowns
 * (Radix Select with the warm palette used on /support and /explore).
 *
 * Accepts the same children as <select> (<option>, <optgroup>) and calls `onChange` with a
 * `{ target: { value } }` object, so existing `e.target.value` handlers keep working.
 */

type Option = { value: string; label: React.ReactNode; disabled?: boolean }
type Group = { label?: React.ReactNode; options: Option[] }

/** Radix Select reserves "" for "no value", so empty-string options map to this sentinel. */
const EMPTY = "__admin_select_empty__"

type ChangeLike = { target: { value: string }; currentTarget: { value: string } }

export type AdminSelectProps = {
  value?: string | number
  defaultValue?: string | number
  onChange?: (event: ChangeLike) => void
  onValueChange?: (value: string) => void
  children?: React.ReactNode
  className?: string
  disabled?: boolean
  id?: string
  placeholder?: string
  size?: "sm" | "default"
  "aria-label"?: string
  title?: string
}

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function collect(children: React.ReactNode): Group[] {
  const groups: Group[] = []
  let loose: Group | null = null

  const visit = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return
      if (child.type === React.Fragment) {
        visit((child.props as { children?: React.ReactNode }).children)
        return
      }
      if (child.type === "optgroup") {
        const props = child.props as { label?: React.ReactNode; children?: React.ReactNode }
        const group: Group = { label: props.label, options: [] }
        React.Children.forEach(props.children, (opt) => {
          if (React.isValidElement(opt) && opt.type === "option") group.options.push(toOption(opt))
        })
        groups.push(group)
        loose = null
        return
      }
      if (child.type === "option") {
        if (!loose) {
          loose = { options: [] }
          groups.push(loose)
        }
        loose.options.push(toOption(child))
      }
    })
  }

  visit(children)
  return groups
}

function toOption(el: React.ReactElement): Option {
  const props = el.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean }
  const raw = props.value ?? textOf(props.children)
  return { value: String(raw) === "" ? EMPTY : String(raw), label: props.children, disabled: props.disabled }
}

/** Keep only layout classes from the old <select> styling; the look comes from the shared trigger. */
function layoutClasses(className?: string) {
  if (!className) return ""
  return className
    .split(/\s+/)
    .filter((token) =>
      /^(?:[a-z]+:)*(?:w-|min-w-|max-w-|m[trblxy]?-|flex-|grow|shrink|basis-|col-|row-|self-|justify-self-|order-)/.test(
        token,
      ),
    )
    .join(" ")
}

export function AdminSelect({
  value,
  defaultValue,
  onChange,
  onValueChange,
  children,
  className,
  disabled,
  id,
  placeholder,
  size = "default",
  title,
  "aria-label": ariaLabel,
}: AdminSelectProps) {
  const groups = React.useMemo(() => collect(children), [children])
  const toInternal = (v: string | number | undefined) =>
    v === undefined ? undefined : String(v) === "" ? EMPTY : String(v)

  const handleChange = (next: string) => {
    const external = next === EMPTY ? "" : next
    onValueChange?.(external)
    onChange?.({ target: { value: external }, currentTarget: { value: external } })
  }

  const layout = layoutClasses(className)

  return (
    <Select
      value={toInternal(value)}
      defaultValue={toInternal(defaultValue)}
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={ariaLabel}
        title={title}
        className={cn(
          "border-warm-100 bg-[#FCFAF7] text-[#1A1410] shadow-none data-[placeholder]:text-[#7C6A5F]",
          layout || "w-full",
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="z-[400] max-h-80 border-warm-100 bg-[#FFFEFD] text-[#1A1410]">
        {groups.map((group, gi) => (
          <SelectGroup key={gi}>
            {group.label ? <SelectLabel>{group.label}</SelectLabel> : null}
            {group.options.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className="cursor-pointer text-[#2F241E] focus:bg-[#F7ECE3] focus:text-[#1A1410]"
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
