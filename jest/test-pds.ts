import net from 'net'
import path from 'path'
import fs from 'fs'
import {TestNetwork, TestPds} from '@atproto/dev-env'
import {AtUri, BskyAgent} from '@atproto/api'

export interface TestUser {
  email: string
  did: string
  handle: string
  password: string
  agent: BskyAgent
}

export interface TestPDS {
  pdsUrl: string
  mocker: Mocker
  close: () => Promise<void>
}

class StringIdGenerator {
  _nextId = [0]
  constructor(
    public _chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ) {}

  next() {
    const r = []
    for (const char of this._nextId) {
      r.unshift(this._chars[char])
    }
    this._increment()
    return r.join('')
  }

  _increment() {
    for (let i = 0; i < this._nextId.length; i++) {
      const val = ++this._nextId[i]
      if (val >= this._chars.length) {
        this._nextId[i] = 0
      } else {
        return
      }
    }
    this._nextId.push(0)
  }

  *[Symbol.iterator]() {
    while (true) {
      yield this.next()
    }
  }
}

const ids = new StringIdGenerator()

export async function createServer(
  {
    inviteRequired,
    phoneRequired,
  }: {inviteRequired: boolean; phoneRequired: boolean} = {
    inviteRequired: false,
    phoneRequired: false,
  },
): Promise<TestPDS> {
  const port = 3000
  const port2 = await getPort(port + 1)
  const port3 = await getPort(port2 + 1)
  const pdsUrl = `http://localhost:${port}`
  const id = ids.next()

  const phoneParams = phoneRequired
    ? {
        phoneVerificationRequired: true,
        twilioAccountSid: 'ACXXXXXXX',
        twilioAuthToken: 'AUTH',
        twilioServiceSid: 'VAXXXXXXXX',
      }
    : {}

  const testNet = await TestNetwork.create({
    pds: {
      port,
      hostname: 'localhost',
      dbPostgresSchema: `pds_${id}`,
      inviteRequired,
      ...phoneParams,
    },
    bsky: {
      dbPostgresSchema: `bsky_${id}`,
      port: port3,
      publicUrl: 'http://localhost:2584',
    },
    plc: {port: port2},
  })
  mockTwilio(testNet.pds)

  const pic = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'default-avatar.png'),
  )

  return {
    pdsUrl,
    mocker: new Mocker(testNet, pdsUrl, pic),
    async close() {
      await testNet.pds.server.destroy()
      await testNet.plc.server.destroy()
    },
  }
}

class Mocker {
  agent: BskyAgent
  users: Record<string, TestUser> = {}

  constructor(
    public testNet: TestNetwork,
    public service: string,
    public pic: Uint8Array,
  ) {
    this.agent = new BskyAgent({service})
  }

  get pds() {
    return this.testNet.pds
  }

  get bsky() {
    return this.testNet.bsky
  }

  get plc() {
    return this.testNet.plc
  }

  // NOTE
  // deterministic date generator
  // we use this to ensure the mock dataset is always the same
  // which is very useful when testing
  *dateGen() {
    let start = 1657846031914
    while (true) {
      yield new Date(start).toISOString()
      start += 1e3
    }
  }

  async createUser(name: string) {
    const agent = new BskyAgent({service: this.agent.service})

    const inviteRes = await agent.api.com.atproto.server.createInviteCode(
      {useCount: 1},
      {
        headers: this.pds.adminAuthHeaders('admin'),
        encoding: 'application/json',
      },
    )

    const email = `fake${Object.keys(this.users).length + 1}@fake.com`
    const res = await agent.createAccount({
      inviteCode: inviteRes.data.code,
      email,
      handle: name + '.test',
      password: 'hunter2',
      verificationPhone: '1234567890',
      verificationCode: '000000',
    })
    await agent.upsertProfile(async () => {
      const blob = await agent.uploadBlob(this.pic, {
        encoding: 'image/jpeg',
      })
      return {
        displayName: name,
        avatar: blob.data.blob,
      }
    })
    this.users[name] = {
      did: res.data.did,
      email,
      handle: name + '.test',
      password: 'hunter2',
      agent: agent,
    }
  }

  async follow(a: string, b: string) {
    await this.users[a].agent.follow(this.users[b].did)
  }

  async generateStandardGraph() {
    await this.createUser('alice')
    await this.createUser('bob')
    await this.createUser('carla')

    await this.users.alice.agent.upsertProfile(() => ({
      displayName: 'Alice',
      description: 'Test user 1',
    }))

    await this.users.bob.agent.upsertProfile(() => ({
      displayName: 'Bob',
      description: 'Test user 2',
    }))

    await this.users.carla.agent.upsertProfile(() => ({
      displayName: 'Carla',
      description: 'Test user 3',
    }))

    await this.follow('alice', 'bob')
    await this.follow('alice', 'carla')
    await this.follow('bob', 'alice')
    await this.follow('bob', 'carla')
    await this.follow('carla', 'alice')
    await this.follow('carla', 'bob')
  }

  async createPost(user: string, text: string) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    return await agent.post({
      text,
      langs: ['en'],
      createdAt: new Date().toISOString(),
    })
  }

  async createImagePost(user: string, text: string) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    const blob = await agent.uploadBlob(this.pic, {
      encoding: 'image/jpeg',
    })
    return await agent.post({
      text,
      langs: ['en'],
      embed: {
        $type: 'app.bsky.embed.images',
        images: [{image: blob.data.blob, alt: ''}],
      },
      createdAt: new Date().toISOString(),
    })
  }

  async createQuotePost(
    user: string,
    text: string,
    {uri, cid}: {uri: string; cid: string},
  ) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    return await agent.post({
      text,
      embed: {$type: 'app.bsky.embed.record', record: {uri, cid}},
      langs: ['en'],
      createdAt: new Date().toISOString(),
    })
  }

  async createReply(
    user: string,
    text: string,
    {uri, cid}: {uri: string; cid: string},
  ) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    return await agent.post({
      text,
      reply: {root: {uri, cid}, parent: {uri, cid}},
      langs: ['en'],
      createdAt: new Date().toISOString(),
    })
  }

  async like(user: string, {uri, cid}: {uri: string; cid: string}) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    return await agent.like(uri, cid)
  }

  async createFeed(user: string, rkey: string, posts: string[]) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    const fgUri = AtUri.make(
      this.users[user].did,
      'app.bsky.feed.generator',
      rkey,
    )
    const fg1 = await this.testNet.createFeedGen({
      [fgUri.toString()]: async () => {
        return {
          encoding: 'application/json',
          body: {
            feed: posts.slice(0, 30).map(uri => ({post: uri})),
          },
        }
      },
    })
    const avatarRes = await agent.api.com.atproto.repo.uploadBlob(this.pic, {
      encoding: 'image/png',
    })
    return await agent.api.app.bsky.feed.generator.create(
      {repo: this.users[user].did, rkey},
      {
        did: fg1.did,
        displayName: rkey,
        description: 'all my fav stuff',
        avatar: avatarRes.data.blob,
        createdAt: new Date().toISOString(),
      },
    )
  }

  async createInvite(forAccount: string) {
    const agent = new BskyAgent({service: this.agent.service})
    await agent.api.com.atproto.server.createInviteCode(
      {useCount: 1, forAccount},
      {
        headers: this.pds.adminAuthHeaders('admin'),
        encoding: 'application/json',
      },
    )
  }

  async labelAccount(label: string, user: string) {
    const did = this.users[user]?.did
    if (!did) {
      throw new Error(`Invalid user: ${user}`)
    }
    const ctx = this.bsky.ctx
    if (!ctx) {
      throw new Error('Invalid appview')
    }
    const labelSrvc = ctx.services.label(ctx.db.getPrimary())
    await labelSrvc.createLabels([
      {
        src: ctx.cfg.labelerDid,
        uri: did,
        cid: '',
        val: label,
        neg: false,
        cts: new Date().toISOString(),
      },
    ])
  }

  async labelProfile(label: string, user: string) {
    const agent = this.users[user]?.agent
    const did = this.users[user]?.did
    if (!did) {
      throw new Error(`Invalid user: ${user}`)
    }

    const profile = await agent.app.bsky.actor.profile.get({
      repo: user + '.test',
      rkey: 'self',
    })

    const ctx = this.bsky.ctx
    if (!ctx) {
      throw new Error('Invalid appview')
    }
    const labelSrvc = ctx.services.label(ctx.db.getPrimary())
    await labelSrvc.createLabels([
      {
        src: ctx.cfg.labelerDid,
        uri: profile.uri,
        cid: profile.cid,
        val: label,
        neg: false,
        cts: new Date().toISOString(),
      },
    ])
  }

  async labelPost(label: string, {uri, cid}: {uri: string; cid: string}) {
    const ctx = this.bsky.ctx
    if (!ctx) {
      throw new Error('Invalid appview')
    }
    const labelSrvc = ctx.services.label(ctx.db.getPrimary())
    await labelSrvc.createLabels([
      {
        src: ctx.cfg.labelerDid,
        uri,
        cid,
        val: label,
        neg: false,
        cts: new Date().toISOString(),
      },
    ])
  }

  async createMuteList(user: string, name: string): Promise<string> {
    const res = await this.users[user]?.agent.app.bsky.graph.list.create(
      {repo: this.users[user]?.did},
      {
        purpose: 'app.bsky.graph.defs#modlist',
        name,
        createdAt: new Date().toISOString(),
      },
    )
    await this.users[user]?.agent.app.bsky.graph.muteActorList({
      list: res.uri,
    })
    return res.uri
  }

  async addToMuteList(owner: string, list: string, subject: string) {
    await this.users[owner]?.agent.app.bsky.graph.listitem.create(
      {repo: this.users[owner]?.did},
      {
        list,
        subject,
        createdAt: new Date().toISOString(),
      },
    )
  }
}

const checkAvailablePort = (port: number) =>
  new Promise(resolve => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => resolve(false))
    server.listen({port}, () => {
      server.close(() => {
        resolve(true)
      })
    })
  })

async function getPort(start = 3000) {
  for (let i = start; i < 65000; i++) {
    if (await checkAvailablePort(i)) {
      return i
    }
  }
  throw new Error('Unable to find an available port')
}

export const mockTwilio = (pds: TestPds) => {
  if (!pds.ctx.twilio) return

  pds.ctx.twilio.sendCode = async (_number: string) => {
    // do nothing
  }

  pds.ctx.twilio.verifyCode = async (_number: string, code: string) => {
    return code === '000000'
  }
}
