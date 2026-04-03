"use client"

import "mapbox-gl/dist/mapbox-gl.css"

import Image from "next/image"

import { listingPhotoThumbnailUrl } from "@/lib/listings/thumbnail-url"
import { X } from "lucide-react"
import type { RefObject } from "react"
import MapboxMap, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapRef,
  type ViewState,
} from "react-map-gl/mapbox"

const SERVICE_COLORS: Record<string, string> = {
  sauna: "#E85D3A",
  cold_plunge: "#3A8BC7",
  hot_tub: "#B27A4A",
  infrared: "#C75B8A",
  float_tank: "#5B7AC7",
  pemf: "#C7A83A",
  hyperbaric: "#3AC76B",
  halotherapy: "#C7C73A",
}

function hasPublishedRating(reviewCount: number, rating: number) {
  return reviewCount >= 1 && Number.isFinite(rating)
}

export type ExploreMapMarkerListing = {
  id: string
  lng: number
  lat: number
  serviceType: string
  priceSolo: number
}

export type ExploreMapPopupListing = ExploreMapMarkerListing & {
  title: string
  photoUrl: string | null
  serviceIcon: string
  reviewCount: number
  rating: number
  serviceLabel: string
  distanceMiles: number
  sessionType: "hourly" | "fixed_session"
}

export type ExploreMapPanelProps = {
  mapRef: RefObject<MapRef | null>
  token: string | undefined
  center: { lat: number; lng: number }
  clusterGeoJson: object
  useClusters: boolean
  markerListings: ExploreMapMarkerListing[]
  activeId: string | null
  activeSource: "hover" | "pin" | null
  onMapBackgroundClick: () => void
  onMoveEnd: (view: ViewState) => void
  loading: boolean
  shouldShowSearchArea: boolean
  onSearchThisArea: () => void
  geoError: string | null
  onRecenter: () => void
  onMarkerSelect: (id: string) => void
  popupListing: ExploreMapPopupListing | null
  onClosePopup: () => void
  onOpenListingFromPopup: (id: string) => void
}

export function ExploreMapPanel({
  mapRef,
  token,
  center,
  clusterGeoJson,
  useClusters,
  markerListings,
  activeId,
  activeSource,
  onMapBackgroundClick,
  onMoveEnd,
  loading,
  shouldShowSearchArea,
  onSearchThisArea,
  geoError,
  onRecenter,
  onMarkerSelect,
  popupListing,
  onClosePopup,
  onOpenListingFromPopup,
}: ExploreMapPanelProps) {
  return (
    <div className="relative h-full w-full">
      <MapboxMap
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 12 }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        onClick={onMapBackgroundClick}
        onMoveEnd={(event) => {
          onMoveEnd(event.viewState)
        }}
      >
        <NavigationControl position="top-right" />

        <div className="absolute top-3 left-3 z-20">
          <button type="button" onClick={onRecenter} className="rounded-full bg-white px-3 py-2 text-sm shadow">
            📍 Recenter
          </button>
          {geoError ? <p className="mt-2 rounded bg-white px-2 py-1 text-xs text-rose-600 shadow">{geoError}</p> : null}
        </div>

        {shouldShowSearchArea ? (
          <div className="absolute right-3 bottom-4 z-20">
            <button
              type="button"
              onClick={onSearchThisArea}
              className="rounded-full bg-[#C75B3A] px-4 py-2 text-sm text-white shadow"
            >
              Search this area
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-10">
            {new Array(8).fill(null).map((_, i) => (
              <span
                key={i}
                className="absolute size-4 animate-pulse rounded-full bg-zinc-300/70"
                style={{ left: `${12 + ((i * 11) % 70)}%`, top: `${18 + ((i * 9) % 60)}%` }}
              />
            ))}
          </div>
        ) : null}

        {useClusters ? (
          <Source id="explore-points" type="geojson" data={clusterGeoJson as never} cluster clusterRadius={45}>
            <Layer
              id="clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{ "circle-color": "#C75B3A", "circle-radius": 20 }}
            />
            <Layer
              id="cluster-count"
              type="symbol"
              filter={["has", "point_count"]}
              layout={{ "text-field": "{point_count_abbreviated}", "text-size": 12 }}
              paint={{ "text-color": "#ffffff" }}
            />
            <Layer
              id="unclustered"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{ "circle-color": "#1A1410", "circle-radius": 6 }}
            />
          </Source>
        ) : (
          markerListings.map((item) => {
            const isHovered = activeId === item.id && activeSource === "hover"
            const isActive = activeId === item.id && activeSource === "pin"
            return (
              <Marker
                key={item.id}
                longitude={item.lng}
                latitude={item.lat}
                anchor="bottom"
                style={{ zIndex: isActive ? 50 : isHovered ? 20 : 1 }}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onMarkerSelect(item.id)
                  }}
                  className={`rounded-full px-2.5 py-1.5 text-[13px] transition-all ${
                    isActive
                      ? "z-20 scale-[1.15] bg-[#C75B3A] text-white"
                      : isHovered
                        ? "z-20 scale-110 bg-[#B44D31] text-white"
                        : "bg-white text-[#2C2420]"
                  }`}
                  style={{
                    border: isActive || isHovered ? "none" : "1px solid #E5DDD6",
                    boxShadow: isActive ? "0 2px 8px rgba(139,69,19,0.35)" : "none",
                  }}
                >
                  <span
                    className="mr-1 inline-block size-2 rounded-full"
                    style={{ backgroundColor: SERVICE_COLORS[item.serviceType] ?? "#E85D3A" }}
                  />
                  ${Math.round(item.priceSolo)}
                </button>
              </Marker>
            )
          })
        )}

        {popupListing ? (
          <Popup
            longitude={popupListing.lng}
            latitude={popupListing.lat}
            anchor="top"
            closeButton={false}
            offset={28}
            onClose={onClosePopup}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpenListingFromPopup(popupListing.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onOpenListingFromPopup(popupListing.id)
                }
              }}
              className="relative w-[220px] overflow-hidden rounded-xl bg-white text-left shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  event.preventDefault()
                  onClosePopup()
                }}
                className="absolute top-2 right-2 z-10 rounded-full bg-white/90 p-1"
              >
                <X className="size-3" />
              </button>
              <div className="relative h-[120px] w-full shrink-0 bg-[#F3E7DC]">
                {popupListing.photoUrl ? (
                  <Image
                    src={
                      listingPhotoThumbnailUrl(popupListing.photoUrl, { width: 440 }) ||
                      popupListing.photoUrl
                    }
                    alt={popupListing.title}
                    fill
                    className="object-cover"
                    sizes="220px"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[#F3E7DC] text-2xl">
                    {popupListing.serviceIcon}
                  </div>
                )}
              </div>
              <div className="space-y-1 p-3 text-xs">
                <p className="line-clamp-1 font-serif text-[13px]">{popupListing.title}</p>
                <p className="text-muted-foreground">
                  {hasPublishedRating(popupListing.reviewCount, popupListing.rating)
                    ? `★ ${popupListing.rating.toFixed(1)} (${popupListing.reviewCount})`
                    : "New"}{" "}
                  · {popupListing.serviceLabel} · {popupListing.distanceMiles.toFixed(1)} mi
                </p>
                <p className="font-medium text-[#C75B3A]">
                  ${Math.round(popupListing.priceSolo)}{" "}
                  {popupListing.sessionType === "fixed_session" ? "/session" : "/pp/hr"}
                </p>
              </div>
            </div>
          </Popup>
        ) : null}
      </MapboxMap>
    </div>
  )
}
