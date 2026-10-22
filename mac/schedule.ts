/**
 * Runs the Apple Notes importer every few minutes with launchd, the Mac's scheduler for
 * background jobs. It starts again after a restart and stops when uninstalled.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON mac/schedule.ts install|uninstall|status
 *
 * Install from a copy of the project in your home folder, not one on an external drive: launchd
 * runs the importer from where it was installed, and a drive isn't always plugged in.
 * BT_NOTES_ROOT, if set when installing, is passed on to the scheduled import.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LABEL = 'com.btyre.btnotes.import'
export const INTERVAL_SECONDS = 300

const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
const logPath = join(homedir(), 'Library', 'Logs', 'BT Notes', 'import.log')
const domain = `gui/${userInfo().uid}`

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The launchd job: run the importer quietly every INTERVAL_SECONDS and once at login. */
export function plist(node: string, script: string, log: string, env: Record<string, string>): string {
  const args = [node, '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script, '--quiet']
  const envEntries = Object.entries(env)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
${
  envEntries.length
    ? `  <key>EnvironmentVariables</key>
  <dict>
${envEntries.map(([k, v]) => `    <key>${xml(k)}</key>\n    <string>${xml(v)}</string>`).join('\n')}
  </dict>
`
    : ''
}  <key>StartInterval</key>
  <integer>${INTERVAL_SECONDS}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(log)}</string>
</dict>
</plist>
`
}

function launchctl(...args: string[]): boolean {
  try {
    execFileSync('launchctl', args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function install(): void {
  const script = resolve(dirname(fileURLToPath(import.meta.url)), 'import-apple-notes.ts')
  if (script.startsWith('/Volumes/')) {
    console.error(`This copy of Vizual Notes is on an external drive (${script}).`)
    console.error('Install from a copy in your home folder, such as ~/BT-Notes-App, so the import runs when the drive is unplugged.')
    process.exit(1)
  }
  const env: Record<string, string> = {}
  if (process.env.BT_NOTES_ROOT) env.BT_NOTES_ROOT = process.env.BT_NOTES_ROOT
  mkdirSync(dirname(plistPath), { recursive: true })
  mkdirSync(dirname(logPath), { recursive: true })
  writeFileSync(plistPath, plist(process.execPath, script, logPath, env))
  // Replace a job installed earlier, which may point at an older copy or another node.
  launchctl('bootout', `${domain}/${LABEL}`)
  if (!launchctl('bootstrap', domain, plistPath)) {
    console.error(`launchd didn't accept ${plistPath}.`)
    process.exit(1)
  }
  console.log(`The Apple Notes import now runs every ${INTERVAL_SECONDS / 60} minutes.`)
  console.log(`  Notes folder: ${env.BT_NOTES_ROOT ?? 'the one the app last opened'}`)
  console.log(`  Log: ${logPath}`)
  console.log('macOS may ask whether node may control Notes; choose OK.')
}

function uninstall(): void {
  const wasLoaded = launchctl('bootout', `${domain}/${LABEL}`)
  const hadFile = existsSync(plistPath)
  rmSync(plistPath, { force: true })
  console.log(wasLoaded || hadFile ? 'The scheduled Apple Notes import is removed.' : 'The Apple Notes import wasn’t scheduled.')
}

function status(): void {
  const loaded = launchctl('print', `${domain}/${LABEL}`)
  console.log(loaded ? `Scheduled every ${INTERVAL_SECONDS / 60} minutes. Log: ${logPath}` : 'Not scheduled.')
}

// Run as a command, not when the tests import plist().
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') {
    console.error('The scheduled import runs on a Mac.')
    process.exit(1)
  }
  const command = process.argv[2]
  if (command === 'install') install()
  else if (command === 'uninstall') uninstall()
  else if (command === 'status') status()
  else {
    console.error('Usage: schedule.ts install|uninstall|status')
    process.exit(1)
  }
}
