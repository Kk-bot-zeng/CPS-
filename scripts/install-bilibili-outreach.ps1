$ErrorActionPreference = 'Stop'
$handler = Join-Path $PSScriptRoot 'bilibili-outreach-protocol.ps1'
$command = ('powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" "%1"' -f $handler)
$root = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Classes\cps-bilibili')
$root.SetValue('', 'URL:CPS Bilibili Outreach')
$root.SetValue('URL Protocol', '')
$root.Close()
$open = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Classes\cps-bilibili\shell\open\command')
$open.SetValue('', $command)
$open.Close()
$policy = '{"allowed_origins":["https://www.zlqnb.online","http://10.68.208.188:8081"],"protocol":"cps-bilibili"}'
foreach ($browser in @('Google\Chrome', 'Microsoft\Edge')) {
  try {
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\Policies\$browser\AutoLaunchProtocolsFromOrigins")
    $key.SetValue('1', $policy)
    $key.Close()
  } catch { Write-Verbose "Browser policy is managed externally; the first-launch confirmation remains enabled." }
}
Write-Host 'CPS Bilibili outreach helper installed.'
