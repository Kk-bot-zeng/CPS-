$ErrorActionPreference = 'Stop'
$handler = Join-Path $PSScriptRoot 'bilibili-outreach-protocol.cmd'
$command = ('\"{0}\" \"%1\"' -f $handler)
& reg.exe add 'HKCU\Software\Classes\cps-bilibili' /ve /d 'URL:CPS Bilibili Outreach' /f | Out-Null
& reg.exe add 'HKCU\Software\Classes\cps-bilibili' /v 'URL Protocol' /d '' /f | Out-Null
& reg.exe add 'HKCU\Software\Classes\cps-bilibili\shell\open\command' /ve /d $command /f | Out-Null
Write-Host 'CPS Bilibili outreach helper installed.'
