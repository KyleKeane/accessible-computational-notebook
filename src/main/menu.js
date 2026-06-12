/**
 * The native menu bar is the accessibility backbone of the app: every
 * feature lives here with an accelerator, so screen-reader users can
 * discover the entire command set with Alt/F10 and standard menu navigation.
 *
 * Accelerator policy: no bare Alt+letter combos (they collide with menu
 * mnemonics) and nothing involving Insert or CapsLock (screen-reader
 * modifier keys). Jupyter's Shift+Enter / Ctrl+Enter / Alt+Enter are kept.
 */

import { app, Menu } from 'electron';
import { sendToRenderer } from './ipc.js';

export function buildMenu({ store, kernels, getWindow, actions, commands }) {
  const toRenderer = (channel) => () => sendToRenderer(getWindow(), channel, {});

  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: '&File',
      submenu: [
        { label: 'New Notebook', accelerator: 'CmdOrCtrl+N', click: () => actions.newNotebook() },
        { label: 'Open Notebook…', accelerator: 'CmdOrCtrl+O', click: () => actions.openNotebook() },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => actions.saveNotebook() },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => actions.saveNotebookAs() },
        { label: 'Export as Script…', click: () => actions.exportScript() },
        { label: 'Export as HTML…', click: () => actions.exportHtml() },
        { label: 'Export Narrative as Text…', click: () => actions.exportNarrative() },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: toRenderer('show-settings') },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Undo Cell Operation',
          accelerator: 'CmdOrCtrl+Alt+Z',
          click: () => commands.undoCellOperation()
        },
        {
          label: 'Redo Cell Operation',
          accelerator: 'CmdOrCtrl+Alt+Y',
          click: () => commands.redoCellOperation()
        },
        { type: 'separator' },
        {
          label: 'Find and Replace…',
          accelerator: 'CmdOrCtrl+F',
          click: toRenderer('show-find')
        },
        {
          // Plain Ctrl on every platform: Cmd+Space is macOS Spotlight.
          label: 'Complete at Cursor',
          accelerator: 'Ctrl+Space',
          click: toRenderer('complete-at-cursor')
        }
      ]
    },
    {
      label: '&Cell',
      submenu: [
        {
          label: 'Run Cell',
          accelerator: 'CmdOrCtrl+Enter',
          click: () => commands.runCell(null)
        },
        {
          label: 'Run Cell and Advance',
          accelerator: 'Shift+Enter',
          click: () => commands.runCell(null, { advance: true })
        },
        {
          label: 'Run Selection',
          accelerator: 'F9',
          click: toRenderer('run-selection')
        },
        {
          label: 'Quick Evaluate…',
          accelerator: 'CmdOrCtrl+E',
          click: toRenderer('show-quick-eval')
        },
        {
          label: 'Run All Cells',
          accelerator: 'CmdOrCtrl+Shift+Enter',
          click: () => commands.runAll()
        },
        { label: 'Run All Above', click: () => commands.runAllAbove() },
        { label: 'Run All Below', click: () => commands.runAllBelow() },
        { type: 'separator' },
        {
          label: 'Insert Code Cell Below',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => commands.insertCell('code', 'below')
        },
        {
          label: 'Insert Code Cell Above',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => commands.insertCell('code', 'above')
        },
        {
          label: 'Insert Markdown Cell Below',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => commands.insertCell('markdown', 'below')
        },
        { type: 'separator' },
        {
          label: 'Change Cell Type',
          submenu: [
            { label: 'Code', click: () => commands.setCellType('code') },
            { label: 'Markdown', click: () => commands.setCellType('markdown') },
            { label: 'Raw', click: () => commands.setCellType('raw') }
          ]
        },
        {
          label: 'Split Cell at Cursor',
          accelerator: 'CmdOrCtrl+Shift+-',
          click: toRenderer('split-cell-at-cursor')
        },
        {
          label: 'Merge with Cell Below',
          click: () => commands.mergeBelow()
        },
        {
          label: 'Move Cell Up',
          accelerator: 'Alt+Up',
          click: () => commands.moveCell('up')
        },
        {
          label: 'Move Cell Down',
          accelerator: 'Alt+Down',
          click: () => commands.moveCell('down')
        },
        {
          label: 'Delete Cell',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => commands.deleteCell()
        },
        { type: 'separator' },
        {
          label: 'Cut Cell',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => commands.cutCell()
        },
        {
          label: 'Copy Cell',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => commands.copyCell()
        },
        {
          label: 'Paste Cell Below',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => commands.pasteCell()
        },
        { type: 'separator' },
        { label: 'Clear Cell Output', click: () => commands.clearOutputs() },
        { label: 'Clear All Outputs', click: () => commands.clearAllOutputs() }
      ]
    },
    {
      label: '&Kernel',
      submenu: [
        ...kernels.list().map((kernel) => ({
          label: kernel.displayName,
          type: 'radio',
          checked: store.metadata.kernelName === kernel.name,
          click: () => commands.setKernel(kernel.name)
        })),
        { type: 'separator' },
        {
          label: 'Interrupt Kernel',
          accelerator: 'CmdOrCtrl+.',
          click: () => commands.interruptKernel()
        },
        {
          label: 'Restart Kernel',
          accelerator: 'CmdOrCtrl+Shift+.',
          click: () => commands.restartKernel()
        },
        {
          label: 'Announce Kernel Status',
          accelerator: 'CmdOrCtrl+Shift+K',
          click: () => commands.kernelStatus()
        },
        {
          label: 'List Variables…',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => commands.listVariables()
        }
      ]
    },
    {
      label: '&Navigate',
      submenu: [
        {
          label: 'Describe Notebook',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => commands.describeNotebook()
        },
        {
          label: 'Describe Current Cell',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: toRenderer('describe-cell')
        },
        {
          label: 'Read Current Cell Output',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: toRenderer('read-output')
        },
        {
          label: 'Add Image Description…',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: toRenderer('describe-image')
        },
        {
          label: 'Describe Symbol at Cursor',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: toRenderer('describe-symbol')
        },
        { type: 'separator' },
        {
          label: 'Go to Section…',
          accelerator: 'CmdOrCtrl+Shift+J',
          click: toRenderer('show-outline')
        },
        {
          label: 'Collapse or Expand Section',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => commands.toggleSection()
        },
        {
          label: 'Read as Narrative…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: toRenderer('show-narrative')
        },
        {
          label: 'Announcement History…',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: toRenderer('show-history')
        },
        {
          label: 'First Cell',
          accelerator: 'CmdOrCtrl+Shift+Home',
          click: toRenderer('focus-first-cell')
        },
        {
          label: 'Last Cell',
          accelerator: 'CmdOrCtrl+Shift+End',
          click: toRenderer('focus-last-cell')
        }
      ]
    },
    {
      label: '&View',
      submenu: [
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'toggleDevTools', accelerator: 'F12' }
      ]
    },
    {
      label: '&Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'F1',
          click: toRenderer('show-help')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}
