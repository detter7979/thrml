"use client"

import { motion } from "framer-motion"

import { ListingCard, type ListingCardData } from "@/components/listings/ListingCard"

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 28 },
  },
}

export function ListingGrid({ listings }: { listings: ListingCardData[] }) {
  if (!listings.length) {
    return <p className="type-label">No listings found.</p>
  }

  return (
    <motion.div
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {listings.map((listing) => (
        <motion.div key={listing.id} variants={itemVariants}>
          <ListingCard listing={listing} />
        </motion.div>
      ))}
    </motion.div>
  )
}
