import assert from 'assert'
import mapSeries from 'p-map-series'
import rmrf from 'rimraf'
import path from 'path'
import OrbitDB from '../src/OrbitDB.js'

// Include test utilities
import {
  config,
  startIpfs,
  stopIpfs,
  testAPIs,
} from 'orbit-db-test-utils'

const last = arr => arr[arr.length - 1]

const dbPath = './orbitdb/tests/eventlog'

Object.keys(testAPIs).forEach(API => {
  describe(`orbit-db - Log Database (${API})`, function() {
    this.timeout(config.timeout)

    let ipfsd, ipfs, orbitdb1

    before(async () => {
      rmrf.sync(dbPath)
      ipfsd = await startIpfs(API, config.daemon1)
      ipfs = ipfsd.api
      orbitdb1 = await OrbitDB.createInstance(ipfs, { directory: path.join(dbPath, '1') })
    })

    after(async () => {
      if(orbitdb1)
        await orbitdb1.stop()

      if (ipfsd)
        await stopIpfs(ipfsd)
    })

    describe('Eventlog', function () {
      it('creates and opens a database', async () => {
        const db = await orbitdb1.eventlog('log database')
        assert.notEqual(db, null)
        assert.equal(db.type, 'eventlog')
        assert.equal(db.dbname, 'log database')
        await db.drop()
      })

      it('returns 0 items when it\'s a fresh database', async () => {
        const db = await orbitdb1.eventlog('log database')
        const items = db.iterator({ limit: -1 }).collect()
        assert.equal(items.length, 0)
        await db.drop()
      })

      it('returns the added entry\'s hash, 1 entry', async () => {
        const db = await orbitdb1.eventlog('first database')
        const hash = await db.add('hello1')
        const items = db.iterator({ limit: -1 }).collect()
        assert.notEqual(hash, null)
        assert.equal(hash, last(items).hash)
        assert.equal(items.length, 1)
        await db.drop()
      })

      it('returns the added entry\'s hash, 2 entries', async () => {
        const db = await orbitdb1.eventlog('first database')
        await db.load()
        await db.add('hello1')
        const prevHash = db.iterator().collect()[0].hash
        const hash = await db.add('hello2')
        const items = db.iterator({ limit: -1 }).collect()
        assert.equal(items.length, 2)
        assert.notEqual(hash, null)
        assert.notEqual(hash, prevHash)
        assert.equal(hash, last(items).hash)
        await db.drop()
      })

      it('adds five items', async () => {
        const db = await orbitdb1.eventlog('second database')
        await mapSeries([1, 2, 3, 4, 5], (i) => db.add('hello' + i))
        const items = db.iterator({ limit: -1 }).collect()
        assert.equal(items.length, 5)
        assert.equal(items[0].payload.value, 'hello1')
        assert.equal(last(items.map((f) => f.payload.value)), 'hello5')
        await db.drop()
      })

      it('adds an item that is > 256 bytes', async () => {
        const db = await orbitdb1.eventlog('third database')
        let msg = Buffer.alloc(1024)
        msg.fill('a')
        const hash = await db.add(msg.toString())
        assert.notEqual(hash, null)
        assert.equal(hash.startsWith('zd'), true)
        assert.equal(hash.length, 49)
        await db.drop()
      })
    })

    describe('Iterator', function() {
      let hashes = []
      const itemCount = 5
      let db

      before(async () => {
        hashes = []
        db = await orbitdb1.eventlog('iterator tests')
        hashes = await mapSeries([0, 1, 2, 3, 4], (i) => db.add('hello' + i))
      })

      describe('Defaults', function() {
        it('returns an iterator', () => {
          const iter = db.iterator()
          const next = iter.next().value
          assert.notEqual(iter, null)
          assert.notEqual(next, null)
        })

        it('returns an item with the correct structure', () => {
          const iter = db.iterator()
          const next = iter.next().value
          assert.notEqual(next, null)
          assert.equal(next.hash.startsWith('zd'), true)
          assert.equal(next.payload.key, null)
          assert.equal(next.payload.value, 'hello4')
        })

        it('implements Iterator interface', () => {
          const iter = db.iterator({ limit: -1 })
          let messages = []

          for(let i of iter)
            messages.push(i.key)

          assert.equal(messages.length, hashes.length)
        })

        it('returns 1 item as default', () => {
          const iter = db.iterator()
          const first = iter.next().value
          const second = iter.next().value
          assert.equal(first.hash, hashes[hashes.length - 1])
          assert.equal(second, null)
          assert.equal(first.payload.value, 'hello4')
        })

        it('returns items in the correct order', () => {
          const amount = 3
          const iter = db.iterator({ limit: amount })
          let i = hashes.length - amount
          for(let item of iter) {
            assert.equal(item.payload.value, 'hello' + i)
            i ++
          }
        })
      })

      describe('Collect', function() {
        it('returns all items', () => {
          const messages = db.iterator({ limit: -1 }).collect()
          assert.equal(messages.length, hashes.length)
          assert.equal(messages[0].payload.value, 'hello0')
          assert.equal(messages[messages.length - 1].payload.value, 'hello4')
        })

        it('returns 1 item', () => {
          const messages = db.iterator().collect()
          assert.equal(messages.length, 1)
        })

        it('returns 3 items', () => {
          const messages = db.iterator({ limit: 3 }).collect()
          assert.equal(messages.length, 3)
        })
      })

      describe('Options: limit', function() {
        it('returns 1 item when limit is 0', () => {
          const iter = db.iterator({ limit: 0 })
          const first = iter.next().value
          const second = iter.next().value
          assert.equal(first.hash, last(hashes))
          assert.equal(second, null)
        })

        it('returns 1 item when limit is 1', () => {
          const iter = db.iterator({ limit: 1 })
          const first = iter.next().value
          const second = iter.next().value
          assert.equal(first.hash, last(hashes))
          assert.equal(second, null)
        })

        it('returns 3 items', () => {
          const iter = db.iterator({ limit: 3 })
          const first = iter.next().value
          const second = iter.next().value
          const third = iter.next().value
          const fourth = iter.next().value
          assert.equal(first.hash, hashes[hashes.length - 3])
          assert.equal(second.hash, hashes[hashes.length - 2])
          assert.equal(third.hash, hashes[hashes.length - 1])
          assert.equal(fourth, null)
        })

        it('returns all items', () => {
          const messages = db.iterator({ limit: -1 })
            .collect()
            .map((e) => e.hash)

          messages.reverse()
          assert.equal(messages.length, hashes.length)
          assert.equal(messages[0], hashes[hashes.length - 1])
        })

        it('returns all items when limit is bigger than -1', () => {
          const messages = db.iterator({ limit: -300 })
            .collect()
            .map((e) => e.hash)

          assert.equal(messages.length, hashes.length)
          assert.equal(messages[0], hashes[0])
        })

        it('returns all items when limit is bigger than number of items', () => {
          const messages = db.iterator({ limit: 300 })
            .collect()
            .map((e) => e.hash)

          assert.equal(messages.length, hashes.length)
          assert.equal(messages[0], hashes[0])
        })
      })

      describe('Option: ranges', function() {
        describe('gt & gte', function() {
          it('returns 1 item when gte is the head', () => {
            const messages = db.iterator({ gte: last(hashes), limit: -1 })
              .collect()
              .map((e) => e.hash)

            assert.equal(messages.length, 1)
            assert.equal(messages[0], last(hashes))
          })

          it('returns 0 items when gt is the head', () => {
            const messages = db.iterator({ gt: last(hashes) }).collect()
            assert.equal(messages.length, 0)
          })

          it('returns 2 item when gte is defined', () => {
            const gte = hashes[hashes.length - 2]
            const messages = db.iterator({ gte: gte, limit: -1 })
              .collect()
              .map((e) => e.hash)

            assert.equal(messages.length, 2)
            assert.equal(messages[0], hashes[hashes.length - 2])
            assert.equal(messages[1], hashes[hashes.length - 1])
          })

          it('returns all items when gte is the root item', () => {
            const messages = db.iterator({ gte: hashes[0], limit: -1 })
              .collect()
              .map((e) => e.hash)

            assert.equal(messages.length, hashes.length)
            assert.equal(messages[0], hashes[0])
            assert.equal(messages[messages.length - 1], last(hashes))
          })

          it('returns items when gt is the root item', () => {
            const messages = db.iterator({ gt: hashes[0], limit: -1 })
              .collect()
              .map((e) => e.hash)

            assert.equal(messages.length, itemCount - 1)
            assert.equal(messages[0], hashes[1])
            assert.equal(messages[3], last(hashes))
          })

          it('returns items when gt is defined', () => {
            const messages = db.iterator({ limit: -1})
              .collect()
              .map((e) => e.hash)

            const gt = messages[2]

            const messages2 = db.iterator({ gt: gt, limit: 100 })
              .collect()
              .map((e) => e.hash)

            assert.equal(messages2.length, 2)
            assert.equal(messages2[0], messages[messages.length - 2])
            assert.equal(messages2[1], messages[messages.length - 1])
          })
        })

        describe('lt & lte', function() {
          it('returns one item after head when lt is the head', () => {
            const messages = db.iterator({ lt: last(hashes) })
              .collect()
              .map((e) => e.hash)

            assert.equal(messages.length, 1)
            assert.equal(messages[0], hashes[hashes.length - 2])
          })

          it('returns all items when lt is head and limit is -1', () => {
            const messages = db.iterator({ lt: last(hashes), limit: -1 })
              .collect()
              .map((e) => e.hash)

            assert.equal(messages.length, hashes.length - 1)
            assert.equal(messages[0], hashes[0])
            assert.equal(messages[messages.length - 1], hashes[hashes.length - 2])
          })

          it('returns 3 items when lt is head and limit is 3', () => {
            const messages = db.iterator({ lt: last(hashes), limit: 3 })
              .collect()
              .map((e) => e.hash)

            assert.equal(messages.length, 3)
            assert.equal(messages[0], hashes[hashes.length - 4])
            assert.equal(messages[2], hashes[hashes.length - 2])
          })

          it('returns null when lt is the root item', () => {
            const messages = db.iterator({ lt: hashes[0] }).collect()
            assert.equal(messages.length, 0)
          })

          it('returns one item when lte is the root item', () => {
            const messages = db.iterator({ lte: hashes[0] })
              .collect()
              .map((e) => e.hash)

            assert.equal(messages.length, 1)
            assert.equal(messages[0], hashes[0])
          })

          it('returns all items when lte is the head', () => {
            const messages = db.iterator({ lte: last(hashes), limit: -1 })
              .collect()
              .map((e) => e.hash)

            assert.equal(messages.length, itemCount)
            assert.equal(messages[0], hashes[0])
            assert.equal(messages[4], last(hashes))
          })

          it('returns 3 items when lte is the head', () => {
            const messages = db.iterator({ lte: last(hashes), limit: 3 })
              .collect()
              .map((e) => e.hash)

            assert.equal(messages.length, 3)
            assert.equal(messages[0], hashes[hashes.length - 3])
            assert.equal(messages[1], hashes[hashes.length - 2])
            assert.equal(messages[2], last(hashes))
          })
        })
      })
    })
  })
})
