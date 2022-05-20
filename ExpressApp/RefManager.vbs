Set ws = WScript.CreateObject("WScript.Shell")
' ws.Run "run.bat", 0, True ' 若不想显示node运行窗口且保存输出到output.log
code = ws.Run("node server.js", 7, True)
if code = 1 then ' 服务器已经打开
  Set ws2 = CreateObject("wscript.shell")
  ws2.Run "start.bat", 0, True
end if