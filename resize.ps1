Add-Type -AssemblyName System.Drawing  
=[System.Drawing.Image]::FromFile('electron/icon.png')  
=[System.Drawing.Image+GetThumbnailImageAbort]{ return False }  
=.GetThumbnailImage(96,96,,[IntPtr]::Zero)  
.Save('public/icons/test-96.png',[System.Drawing.Imaging.ImageFormat]::Png)  
.Dispose()  
.Dispose()  
Write-Host OK 
