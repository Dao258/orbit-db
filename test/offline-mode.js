import fs from 'fs'
import path from 'path'
import assert from 'assert'
import mapSeries from 'p-map-series'
import rmrf from 'rimraf'
import OrbitDB from '../src/OrbitDB.js'
import Identities from 'orbit-db-identity-provider'
import Keystore from 'orbit-db-keystore'
import storageAdapter from 'orbit-db-storage-adapter'

// Include test utilities
import {
  config,
  startIpfs,
  stopIpfs,
  testAPIs,
} from 'orbit-db-test-utils'

const storage = storageAdapter() 

const dbPath1 = './orbitdb/tests/offline/db1'
const dbPath2 = './orbitdb/tests/offline/db2'

Object.keys(testAPIs).forEach(API => {
  describe(`orbit-db - Offline mode (${API})`, function() {
    this.timeout(config.timeout)

    let ipfsd1, ipfsd2, ipfs1, ipfs2, orbitdb, db, keystore
    let identity1, identity2
    let localDataPath

    before(async () => {
      rmrf.sync(dbPath1)
      rmrf.sync(dbPath2)
      ipfsd1 = await startIpfs(API, config.daemon1)
      ipfsd2 = await startIpfs(API, config.daemon2)
      ipfs1 = ipfsd1.api
      ipfs2 = ipfsd2.api
    })

    after(async () => {
      if(orbitdb)
        await orbitdb.stop()

      if (ipfsd1)
        await stopIpfs(ipfsd1)
      if (ipfsd2)
        await stopIpfs(ipfsd2)
    })

    beforeEach(() => {
      rmrf.sync(dbPath1)
      rmrf.sync(dbPath2)
    })

    it('starts in offline mode', async () => {
      orbitdb = await OrbitDB.createInstance(ipfs1, { id: 'A', offline: true, directory: dbPath1 })
      assert.equal(orbitdb._pubsub, null)
      await orbitdb.stop()
    })

    it('does not start in offline mode', async () => {
      orbitdb = await OrbitDB.createInstance(ipfs1, { offline: false, directory: dbPath1 })
      assert.notEqual(orbitdb._pubsub, null)
      await orbitdb.stop()
    })

    it('does not start in offline mode - default', async () => {
      orbitdb = await OrbitDB.createInstance(ipfs1, { directory: dbPath1 })
      assert.notEqual(orbitdb._pubsub, null)
      await orbitdb.stop()
    })

    it('throws error if no `id` passed in offline mode', async () => {
      let err
      try {
        orbitdb = await OrbitDB.createInstance(ipfs1, { offline: true, directory: dbPath1 })
      } catch (e) {
        err = e.message
      }
      assert.equal(err, 'Offline mode requires passing an `id` in the options')
      await orbitdb.stop()
    })
  })
})
