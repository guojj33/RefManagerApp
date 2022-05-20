const { app, BrowserWindow } = require('electron');
const { stdout } = require('process');
const spawn = require("child_process").spawn;

const expressPath = './ExpressApp/server.js'
const nodePath = './ExpressApp/node-v16.15.0-win-x64/node.exe'

const gotTheLock = app.requestSingleInstanceLock()

let mainWindow = undefined

if (!gotTheLock) {
  app.quit()
}
else {
  app.on('second-instance', (eve, cmd, wd) => {
    if (mainWindow != undefined) {
      if (mainWindow.isMinimized())
        mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
  app.on('ready', function() {
    console.log('ready')
    let nodeProc = spawn(nodePath, [expressPath], {cwd: app.getAppPath()})
    nodeProc.stdout.on('data', data => {
      console.log(data.toString())
    })
    nodeProc.stderr.on('data', data => {
      console.log('stderr:', data.toString())
    })
    nodeProc.on('close', (code, signal) => {
      console.log('node close')
    })
    mainWindow = new BrowserWindow({
      show: false,
      maximizable: true,
      autoHideMenuBar: false,
      // useContentSize: true,
      resizable: true,
    });
    mainWindow.on("close", () => {
      console.log('mainWindow close')
      nodeProc.kill()
    });
  
    mainWindow.loadURL(__dirname + '/ExpressApp/index.html');
    mainWindow.maximize()
    mainWindow.show()
    mainWindow.focus()
  })
}