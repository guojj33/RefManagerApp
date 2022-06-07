Set ws = WScript.CreateObject("WScript.Shell")
ws.Run "run.bat", 7, False
Set ws2 = CreateObject("wscript.shell")
ws2.Run "start.bat", 7, False