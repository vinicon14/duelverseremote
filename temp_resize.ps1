Add-Type -AssemblyName System.Drawing 
='public\\favicon.png' 
='public\\icons\\test-128x128.png' 
=[System.Drawing.Image]::FromFile() 
=New-Object System.Drawing.Bitmap 128,128 
=[System.Drawing.Graphics]::FromImage() 
.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic 
.DrawImage(,0,0,128,128) 
.Save(,[System.Drawing.Imaging.ImageFormat]::Png) 
.Dispose() 
.Dispose() 
.Dispose() 
Write-Host saved
