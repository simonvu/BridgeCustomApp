import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearAllArtworks() {
  console.log("🧹 Clearing all sample artworks from database...");

  // 1. Delete Studio Artworks (Cascades to studioScreens, layers, fields, rules)
  const deletedStudio = await (prisma as any).studioArtwork.deleteMany({});
  console.log(`✅ Deleted ${deletedStudio.count} Studio Artwork records.`);

  // 2. Delete Main Artworks
  const deletedArtworks = await prisma.artwork.deleteMany({});
  console.log(`✅ Deleted ${deletedArtworks.count} Main Artwork records.`);

  console.log("🎉 Database artwork tables are now 100% clean and ready for your test creations!");
}

clearAllArtworks()
  .catch((e) => console.error("Error clearing artworks:", e))
  .finally(() => prisma.$disconnect());
