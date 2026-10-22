import { describe, expect, it } from 'vitest'
import { defaultWorkspaceName, normalizeSettings, settingsOf } from './workspaces'

const icloud = '/Users/me/Library/Mobile Documents/com~apple~CloudDocs/BT Notes'
const work = 'C:\\Users\\me\\OneDrive - Porsche Cars North America\\BT Notes'

describe('workspaces', () => {
  it('turns settings from before workspaces into a list of one', () => {
    expect(normalizeSettings({ root: icloud })).toEqual({ workspaces: [{ name: 'Personal', path: icloud }], active: icloud, capture: icloud })
    expect(normalizeSettings({ root: work }).workspaces).toEqual([{ name: 'Work', path: work }])
  })

  it('keeps the list, the open one and the capture one, and drops repeats', () => {
    const state = normalizeSettings({
      root: work,
      captureRoot: icloud,
      workspaces: [{ name: 'Personal', path: icloud }, { name: 'Work', path: work }, { name: 'Again', path: icloud + '/' }],
    })
    expect(state.workspaces.map((w) => w.name)).toEqual(['Personal', 'Work'])
    expect([state.active, state.capture]).toEqual([work, icloud])
    expect(normalizeSettings(settingsOf(state))).toEqual(state)
  })

  it('sends captures to the first workspace unless one is chosen', () => {
    expect(normalizeSettings({ root: work, workspaces: [{ name: 'Personal', path: icloud }, { name: 'Work', path: work }] }).capture).toBe(icloud)
  })

  it('has nothing open with no settings', () => {
    expect(normalizeSettings({})).toEqual({ workspaces: [], active: null, capture: null })
  })

  it('names new workspaces without repeating a name', () => {
    expect(defaultWorkspaceName('/x/Notes', [])).toBe('Personal')
    expect(defaultWorkspaceName('/x/Notes', [{ name: 'Personal', path: '/a' }])).toBe('Notes')
    expect(defaultWorkspaceName('/y/Notes', [{ name: 'Personal', path: '/a' }, { name: 'Notes', path: '/x/Notes' }])).toBe('Notes 2')
  })
})
