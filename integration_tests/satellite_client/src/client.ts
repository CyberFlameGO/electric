import Database from 'better-sqlite3'
import jwt from 'jsonwebtoken'
import { ElectricConfig } from 'electric-sql'
import { ConsoleClient, TokenRequest } from 'electric-sql/dist/satellite'

import { setLogLevel } from 'electric-sql/debug'
import { electrify } from 'electric-sql/node'
import * as fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import {DalNamespace} from "electric-sql/dist/client/model/dalNamespace"
import {z} from 'zod'

setLogLevel('DEBUG')

// Console client throws an error when unable to fetch token which causes test to fail
export class MockConsoleClient implements ConsoleClient {
  token = async (request: TokenRequest) => {
    const mockIss =
      process.env.SATELLITE_AUTH_SIGNING_ISS || 'dev.electric-sql.com'
    const mockKey =
      process.env.SATELLITE_AUTH_SIGNING_KEY ||
      'integration-tests-signing-key-example'

    const iat = Math.floor(Date.now() / 1000) - 1000

    const token = jwt.sign(
      { user_id: request.clientId, type: 'access', iat },
      mockKey,
      {
        issuer: mockIss,
        algorithm: 'HS256',
        expiresIn: '2h',
      }
    )

    // Refresh token is not going to be used, so we don't mock it
    return { token, refreshToken: '' }
  }
}

export const read_migrations = (migration_file: string) => {
  const data = fs.readFileSync(migration_file)
  const json_data = JSON.parse(data.toString())
  return json_data.migrations
}

const dbSchema = {
  items: z.object({
    id: z.string(),
    content: z.string(),
    content_text_null: z.string().nullish(),
    content_text_null_default: z.string().nullish(),
    intvalue_null: z.number().int().nullish(),
    intvalue_null_default: z.number().int().nullish()
  }).strict(),

  other_items: z.object({
    id: z.string(),
    content: z.string()
  }).strict()
}
type DbSchema = typeof dbSchema

export const open_db = (
  name: string,
  host: string,
  port: number,
  migrations: any
): Promise<DalNamespace<DbSchema>> => {
  const original = new Database(name)
  const config: ElectricConfig = {
    app: 'satellite_client',
    env: 'default',
    migrations: migrations,
    replication: {
      host: host,
      port: port,
      ssl: false,
    },
    debug: true,
  }
  console.log(`config: ${JSON.stringify(config)}`)
  return electrify(original, dbSchema, config, {
    console: new MockConsoleClient(),
  })
}

export const set_subscribers = (db: DalNamespace<DbSchema>) => {
  db.notifier.subscribeToAuthStateChanges((x) => {
    console.log('auth state changes: ')
    console.log(x)
  })
  db.notifier.subscribeToPotentialDataChanges((x) => {
    console.log('potential data change: ')
    console.log(x)
  })
  db.notifier.subscribeToDataChanges((x) => {
    console.log('data changes: ')
    console.log(JSON.stringify(x))
  })
}

export const get_items = async (db: DalNamespace<DbSchema>) => {
  return await db.dal.items.findMany({})
}

export const insert_item = async (db: DalNamespace<DbSchema>, keys: [string]) => {
  const items = keys.map(k => {
    return {
      id: uuidv4(),
      content: k
    }
  })

  await db.dal.items.createMany({
    data: items
  })
}

export const delete_item = async (db: DalNamespace<DbSchema>, keys: [string]) => {
  for (const key of keys) {
    await db.dal.items.deleteMany({
      where: {
        content: key
      }
    })
  }
}

export const get_other_items = async (db: DalNamespace<DbSchema>) => {
  return await db.dal.other_items.findMany({})
}

export const insert_other_item = async (db: DalNamespace<DbSchema>, keys: [string]) => {
  const items = keys.map(k => {
    return {
      id: uuidv4(),
      content: k
    }
  })

  await db.dal.other_items.createMany({
    data: items
  })
}

export const delete_other_item = async (db: DalNamespace<DbSchema>, keys: [string]) => {
  for (const key of keys) {
    await db.dal.other_items.deleteMany({
      where: {
        content: key
      }
    })
  }
}
