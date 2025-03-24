import { PrismaClient } from '@prisma/client'

//! Here we define the custom types derived from the Prisma schema

// const graphSchema = Prisma.validator<Prisma.GraphDefaultArgs>()({
//   select: {
//     id: true,
//     path: true,
//     graph: true,

//   }
// })

// export type GraphSchema = Prisma.GraphGetPayload<typeof graphSchema>

const prisma = new PrismaClient()
export default prisma
