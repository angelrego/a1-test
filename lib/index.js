const assert = require('assert')
const chromeLauncher = require('chrome-launcher')
const CDP = require('chrome-remote-interface')
const fs = require('fs')
const path = require('path')
const util = require('util')
const readdir = util.promisify(fs.readdir)

module.exports = { folder, url }

//chromePath: '/usr/lib/chromium-browser/chromium-browser'

async function folder(folderPath, chromePath) {
  try {
    const files = await readdir(folderPath)
    const htmlFiles = files.filter(file => file.endsWith('.html')).map(file => 'file://' + path.join(folderPath, file))
    testChrome(htmlFiles, chromePath)
  } catch (e) {
    assert.fail(e)
  }
}

async function url(url, chromePath, depth) {
  try {
    testChrome([url], chromePath, depth)
  } catch (e) {
    assert.fail(e)
  }
}

async function launchChrome(chromePath) {
  const params = { port: 9222, chromeFlags: ['--window-size=412,732', '--disable-gpu', '--headless'] }
  if (chromePath) params.chromePath = '/usr/lib/chromium-browser/chromium-browser'
  return chromeLauncher.launch(params)
}

async function testChrome(urls, chromePath, depth) {
  let chrome
  try {
    chrome = await launchChrome(chromePath)
    const protocol = await CDP({ port: chrome.port })
    const { Page, Console, Runtime } = protocol

    try {
      await Promise.all([Console.enable(), Page.enable(), Runtime.enable()])
      await Console.clearMessages()
      //-----TEST CONSOLE ERRORS----------
      Console.messageAdded(params => {
        // console.log(params)
        if (params.message.level == 'error') {
          console.error(params)
          throw new Error(params)
        }
      })

      //------IF DEPTH, LOOKUP HREF tags------
      Page.loadEventFired(async() => {
        if (depth && depth > 0) {
          const relatedUrls = await Runtime.evaluate({ expression: '[...document.querySelector("a")].map(e => e.href)' })
          const newDepth = depth - 1
          for (let u of relatedUrls) await testChrome(u, chromePath, newDepth)
        }
      })

      //------PROCESS FILE------
      for (let url of urls) {
        console.log(url)
        await Page.navigate({ url })
        await Page.loadEventFired()
      }
    } catch (err) {
      assert.fail(err)
      throw err
    }
  } catch (err) {
    assert.fail(err)
    throw err
  } finally {
    if (chrome) await chrome.kill()
  }

}
