"use client"

import Image from "next/image"
import Link from "next/link"
import { useState } from "react"

import type { AppIntent } from "@/lib/app-nav"
import { cn } from "@/lib/utils"

const SLIDES = [
  {
    image: "/hero-main-bg.jpg",
    alt: "A barrel sauna glowing on a backyard deck at dusk",
    kicker: "Private, by the session",
    title: "A sauna of your own, for an hour.",
    body: "Backyard and home saunas hosted by people nearby. No membership. No crowded spa.",
  },
  {
    image: "/hero-sauna.png",
    alt: "A wood-fired barrel sauna open in a cedar forest",
    kicker: "How a visit works",
    title: "Pick a time. Show up. Unwind.",
    body: "You pay on thrml. The cancellation rule is on the listing before you book, and your host sends the way in.",
  },
  {
    image: "/hero-main-bg.jpg",
    alt: "Warm light from a sauna door on a wooden deck",
    kicker: "If you have the space",
    title: "Your sauna can earn while you are out.",
    body: "List it, set your hours, and guests book the sessions you are not using.",
  },
] as const

const ROLES: Array<{ id: AppIntent; title: string; body: string }> = [
  { id: "guest", title: "I want to book", body: "Find a private sauna and reserve a session." },
  { id: "host", title: "I want to list my space", body: "Start a listing and welcome guests." },
  { id: "both", title: "I want to do both", body: "Book when you want heat. List when you have it." },
]

export function SignupIntro({
  intent,
  onIntent,
  onContinue,
}: {
  intent: AppIntent
  onIntent: (intent: AppIntent) => void
  onContinue: () => void
}) {
  const [index, setIndex] = useState(0)
  const [choosing, setChoosing] = useState(false)
  const slide = SLIDES[index]
  const last = index === SLIDES.length - 1

  return (
    <div className="relative min-h-[100svh] bg-[#1A1410] text-[#F5EFE8]">
      <Image
        src={slide.image}
        alt={slide.alt}
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#1A1410]/55 via-[#1A1410]/15 to-[#1A1410]" />

      <div className="relative z-10 flex min-h-[100svh] flex-col px-6 pt-6 pb-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="font-serif text-3xl lowercase">
            thrml
          </Link>
          <Link href="/login" className="text-sm text-white/80">
            Log in
          </Link>
        </div>

        <div className="mt-auto mx-auto w-full max-w-lg">
          {choosing ? (
            <div className="space-y-3">
              <p className="text-[13px] font-medium tracking-[0.16em] text-[#E8B9A4] uppercase">How you will use thrml</p>
              <h1 className="font-serif text-4xl leading-tight">Guest, host, or both.</h1>
              <div className="mt-5 space-y-3">
                {ROLES.map((role) => {
                  const selected = intent === role.id
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => onIntent(role.id)}
                      className={cn(
                        "w-full rounded-2xl px-4 py-4 text-left",
                        selected ? "bg-[#F5EFE8] text-[#1A1410]" : "bg-white/10 text-[#F5EFE8]"
                      )}
                    >
                      <span className="block font-medium">{role.title}</span>
                      <span className={cn("mt-1 block text-sm", selected ? "text-[#5c5148]" : "text-white/70")}>
                        {role.body}
                      </span>
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={onContinue}
                className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#C75B3A] text-base font-medium text-white"
              >
                Continue
              </button>
            </div>
          ) : (
            <div>
              <p className="text-[13px] font-medium tracking-[0.16em] text-[#E8B9A4] uppercase">{slide.kicker}</p>
              <h1 className="mt-3 font-serif text-4xl leading-[1.05] md:text-5xl">{slide.title}</h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-white/75">{slide.body}</p>
              <div className="mt-8 flex items-center justify-between gap-4">
                <div className="flex gap-2" aria-hidden="true">
                  {SLIDES.map((item, dot) => (
                    <span
                      key={item.kicker}
                      className={cn("h-1.5 rounded-full", dot === index ? "w-6 bg-[#F5EFE8]" : "w-1.5 bg-white/40")}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  {index > 0 ? (
                    <button
                      type="button"
                      onClick={() => setIndex((value) => value - 1)}
                      className="inline-flex h-12 items-center rounded-full px-4 text-sm text-white/80"
                    >
                      Back
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => (last ? setChoosing(true) : setIndex((value) => value + 1))}
                    className="inline-flex h-12 items-center rounded-full bg-[#F5EFE8] px-6 text-sm font-medium text-[#1A1410]"
                  >
                    {last ? "Choose your side" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
