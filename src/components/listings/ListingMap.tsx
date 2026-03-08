export function ListingMap({ lat, lng }: { lat: number; lng: number }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) {
    return (
      <div className="card-base flex h-80 items-center justify-center p-4 text-sm text-warm-600">
        Mapbox token missing. Add `NEXT_PUBLIC_MAPBOX_TOKEN`.
      </div>
    )
  }

  const src = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+f97316(${lng},${lat})/${lng},${lat},12,0/1000x600?access_token=${token}`
  return <img src={src} alt="Listing map view" className="card-base h-80 w-full object-cover p-0" />
}
