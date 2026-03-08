export type SpecField = {
  key: string
  label: string
  unit?: string
}

export const SPEC_CONFIG: Record<string, SpecField[]> = {
  sauna: [
    { key: "sauna_type", label: "Type" },
    { key: "temperature_max_f", label: "Max temp", unit: "°F" },
    { key: "capacity", label: "Capacity", unit: "persons" },
    { key: "wood_type", label: "Wood" },
    { key: "heat_source", label: "Heat source" },
  ],
  cold_plunge: [
    { key: "temp_range_f", label: "Temperature", unit: "°F" },
    { key: "chiller_type", label: "Chiller" },
    { key: "vessel", label: "Vessel" },
    { key: "min_temp_f", label: "Min temp", unit: "°F" },
  ],
  infrared: [
    { key: "wavelength_nm", label: "Wavelength", unit: "nm" },
    { key: "panel_type", label: "Panel type" },
    { key: "session_length_minutes", label: "Session length", unit: "min" },
  ],
  hot_tub: [
    { key: "capacity", label: "Capacity", unit: "persons" },
    { key: "temperature", label: "Temperature", unit: "°F" },
    { key: "jets", label: "Jets" },
    { key: "cover_included", label: "Cover included" },
  ],
  float_tank: [
    { key: "tank_type", label: "Tank type" },
    { key: "solution", label: "Solution" },
    { key: "water_temp_f", label: "Water temp", unit: "°F" },
    { key: "tank_dimensions", label: "Dimensions" },
  ],
  hyperbaric: [
    { key: "chamber_type", label: "Chamber type" },
    { key: "max_pressure_ata", label: "Max pressure", unit: "ATA" },
    { key: "oxygen_concentration", label: "Oxygen" },
    { key: "capacity", label: "Capacity", unit: "persons" },
  ],
  pemf: [
    { key: "device_brand", label: "Device" },
    { key: "frequency_range_hz", label: "Frequency", unit: "Hz" },
    { key: "mat_type", label: "Mat type" },
  ],
  halotherapy: [
    { key: "salt_type", label: "Salt type" },
    { key: "particle_size_microns", label: "Particle size", unit: "μm" },
    { key: "room_type", label: "Room type" },
    { key: "session_length_minutes", label: "Session length", unit: "min" },
  ],
}
