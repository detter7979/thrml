export type ServiceType =
  | "sauna"
  | "cold_plunge"
  | "hot_tub"
  | "infrared"
  | "float_tank"
  | "pemf"
  | "halotherapy"
  | "hyperbaric"

export const SERVICE_TYPES: {
  value: ServiceType
  label: string
  emoji: string
  description: string
}[] = [
  {
    value: "sauna",
    label: "Sauna",
    emoji: "🔥",
    description: "Traditional or wood-fired sauna",
  },
  {
    value: "cold_plunge",
    label: "Cold Plunge",
    emoji: "🧊",
    description: "Cold water immersion therapy",
  },
  {
    value: "hot_tub",
    label: "Hot Tub",
    emoji: "🛁",
    description: "Private hot tub or jacuzzi",
  },
  {
    value: "infrared",
    label: "Infrared",
    emoji: "🔴",
    description: "Infrared sauna therapy",
  },
  {
    value: "float_tank",
    label: "Float Tank",
    emoji: "🛶",
    description: "Sensory deprivation float tank",
  },
  {
    value: "pemf",
    label: "PEMF",
    emoji: "🧲",
    description: "Pulsed electromagnetic field therapy",
  },
  {
    value: "halotherapy",
    label: "Halotherapy",
    emoji: "🫁",
    description: "Salt therapy room",
  },
  {
    value: "hyperbaric",
    label: "Hyperbaric",
    emoji: "🫧",
    description: "Hyperbaric oxygen chamber",
  },
]

export const getServiceType = (value: string) =>
  SERVICE_TYPES.find((serviceType) => serviceType.value === value)

export const formatServiceType = (value: string) =>
  getServiceType(value)?.label ??
  value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())

