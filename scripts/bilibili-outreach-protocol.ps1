param([Parameter(Mandatory = $true)][string]$ProtocolUrl)
$runtime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node'
$node = Join-Path $runtime 'bin\node.exe'
$script = Join-Path $PSScriptRoot 'bilibili-outreach.mjs'
Start-Process -FilePath $node -ArgumentList @($script, $ProtocolUrl) -WindowStyle Minimized
