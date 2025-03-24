import { LGraph } from '@haski/ta-lib'
import { Prisma, PrismaClient } from '@prisma/client'
import { DefaultArgs } from '@prisma/client/runtime/library'

import Logger from './Logger'

const log = Logger.getInstance().log

export async function prismaGraphCreateOrUpdate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
  pathname: string | null,
  lgraph: LGraph
) {
  return prisma.graph
    .findFirstOrThrow({
      where: {
        path: pathname ?? ''
      }
    })
    .then(() => {
      prisma.graph
        .update({
          where: {
            path: pathname ?? ''
          },
          data: {
            graph: JSON.stringify(lgraph.serialize())
          }
        })
        .then(() => {
          log.debug('Saved graph')
        })
        .catch((e) => {
          log.error(e)
        })
    })
    .catch(() => {
      log.info('Creating new graph')
      prisma.graph
        .create({
          data: {
            path: pathname ?? '',
            graph: JSON.stringify(lgraph.serialize())
          }
        })
        .then(() => {
          log.debug('Saved graph')
        })
        .catch((e) => {
          log.error(e)
        })
    })
}
