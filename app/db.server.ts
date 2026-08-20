import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

function createPrismaClient() {
  return new PrismaClient();
}

if (process.env.NODE_ENV !== "production") {
  // Re-create Prisma Client in dev mode to pick up newly pushed schema fields (e.g. thumbnailUrl)
  global.prismaGlobal = createPrismaClient();
}

const prisma = global.prismaGlobal || createPrismaClient();

export default prisma;
