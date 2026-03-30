Add-Type -AssemblyName System.Drawing
$src=[System.Drawing.Image]::FromFile('electron/icon.png')
if (-not (Test-Path 'public/icons')) { New-Item -ItemType Directory -Path 'public/icons' | Out-Null }
if (-not (Test-Path 'dist/icons')) { New-Item -ItemType Directory -Path 'dist/icons' | Out-Null }
foreach ($size in 72,96,128,144,152,192,384,512) {
  $thumb=$src.GetThumbnailImage($size,$size,[System.Drawing.Image+GetThumbnailImageAbort]{ return $false },[IntPtr]::Zero)
  $file="public/icons/icon-$size`x$size.png"
  $thumb.Save($file,[System.Drawing.Imaging.ImageFormat]::Png)
  Copy-Item -Path $file -Destination "dist/icons/icon-$size`x$size.png" -Force
  $thumb.Dispose()
}
$src.Dispose()
Write-Host OK