#! /usr/bin/env node

/* eslint-disable no-console */
'use strict'

/**
 * Handle any uncaught errors
 *
 * @param {any} err
 * @param {string} [origin]
 */
const onUncaughtException = (err, origin) => {
  if (!origin || origin === 'uncaughtException') {
    console.error(err)
    process.exit(1)
  }
}

/**
 * Handle any uncaught errors
 *
 * @param {any} err
 */
const onUnhandledRejection = (err) => {
  console.error(err)
  process.exit(1)
}

process.once('uncaughtException', onUncaughtException)
process.once('unhandledRejection', onUnhandledRejection)

const semver = require('semver')
const pkg = require('../package.json')

process.title = pkg.name

// Check for node version
if (!semver.satisfies(process.versions.node, pkg.engines.node)) {
  console.error(`Please update your Node.js version to ${pkg.engines.node}`)
  process.exit(1)
}

const updateNotifier = require('update-notifier')

// If we're not running an rc, check if an update is available and notify
if (!pkg.version.includes('-rc')) {
  const oneWeek = 1000 * 60 * 60 * 24 * 7
  updateNotifier({ pkg, updateCheckInterval: oneWeek }).notify()
}

const { NotEnabledError } = require('ipfs-core/src/errors')
// @ts-ignore - TODO: refactor this so it does not require deep requires
const { print, getIpfs, getRepoPath } = require('ipfs-cli/src/utils')
const debug = require('debug')('ipfs:cli')
const cli = require('ipfs-cli')

/**
 * @param {string[]} argv
 */
async function main (argv) {
  let exitCode = 0
  let ctx = {
    print,
    getStdin: () => process.stdin,
    repoPath: getRepoPath(),
    cleanup: () => {},
    isDaemon: false,
    ipfs: undefined
  }

  const command = argv.slice(2)

  try {
    const data = await cli(command, async (argv) => {
      if (!['daemon', 'init'].includes(command[0])) {
        const { ipfs, isDaemon, cleanup } = await getIpfs(argv)

        ctx = {
          ...ctx,
          ipfs,
          isDaemon,
          cleanup
        }
      }

      argv.ctx = ctx

      return argv
    })

    if (data) {
      print(data)
    }
  } catch (err) {
    // TODO: export errors from ipfs-repo to use .code constants
    if (err.code === 'ERR_INVALID_REPO_VERSION') {
      err.message = 'Incompatible repo version. Migration needed. Pass --migrate for automatic migration'
    }

    if (err.code === NotEnabledError.code) {
      err.message = `no IPFS repo found in ${ctx.repoPath}.\nplease run: 'ipfs init'`
    }

    // Handle yargs errors
    if (err.code === 'ERR_YARGS') {
      err.yargs.showHelp()
      ctx.print.error('\n')
      ctx.print.error(`Error: ${err.message}`)
    } else if (debug.enabled) {
      // Handle commands handler errors
      debug(err)
    } else {
      ctx.print.error(err.message)
    }

    exitCode = 1
  } finally {
    await ctx.cleanup()
  }

  if (command[0] === 'daemon') {
    // don't shut down the daemon process
    return
  }

  process.exit(exitCode)
}

main(process.argv)
