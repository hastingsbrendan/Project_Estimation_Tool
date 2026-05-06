import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "@/app/generated/prisma/client"

const globalForPrisma = global as unknown as { prisma: PrismaClient }

function createPrisma() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")

  const authToken = process.env.DATABASE_AUTH_TOKEN
  const adapter = new PrismaLibSql({ url, authToken })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrisma()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
