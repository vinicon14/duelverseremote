const fs = require('fs');
const script = `Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Image]::FromFile('electron/icon.png')
$callback=[System.Drawing.Image+GetThumbnailImageAbort]{ return $false }
$thumb=$img.GetThumbnailImage(96,96,$callback,[IntPtr]::Zero)
$thumb.Save('public/icons/test-96.png',[System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
$thumb.Dispose()
Write-Host OK
`;
fs.writeFileSync('resize.ps1', script);
console.log('resize.ps1 created');
