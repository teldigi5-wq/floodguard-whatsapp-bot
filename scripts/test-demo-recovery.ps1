# Supervised CI-only recovery of this script's child demo processes.
# Never calls start:pc, Baileys, Firebase, PM2 or physical devices.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repo=Split-Path -Parent $PSScriptRoot
$envFile=Join-Path $repo '.env'
if (!(Test-Path -LiteralPath $envFile)) { throw 'Run the private setup helper before the offline recovery smoke test.' }
$tokenLine=@(Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^FLOODGUARD_SETUP_TOKEN=' })
if ($tokenLine.Count -ne 1) { throw 'Expected exactly one private setup-token field.' }
$token=$tokenLine[0].Substring('FLOODGUARD_SETUP_TOKEN='.Length).Trim()
if ($token.Length -lt 32) { throw 'A strong admin token is required.' }
$auth='Basic '+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('admin:'+$token))
$headers=@{ Authorization=$auth }
$oldPort=[Environment]::GetEnvironmentVariable('DEMO_PORT','Process')
try{
  # Pick an unprivileged random local port; no service on that port is stopped
  # except the exact child process started by this rehearsal.
  $port=[Random]::new().Next(22000,49000)
  $env:DEMO_PORT=[string]$port
  $base='http://127.0.0.1:'+$port
  for($cycle=1;$cycle -le 2;$cycle++){
    $child=$null
    try{
      $child=Start-Process -FilePath 'node' -ArgumentList 'scripts/start-demo.js' -WorkingDirectory $repo -PassThru -NoNewWindow
      $ready=$false
      for($attempt=0;$attempt -lt 32;$attempt++){
        if($child.HasExited){throw 'Synthetic demo exited unexpectedly during recovery smoke test.'}
        try{
          $response=Invoke-RestMethod -Uri ($base+'/status') -Headers $headers -TimeoutSec 2
          if($response.demoMode -eq $true -and $response.whatsapp -eq 'DEMO_MODE' -and $response.firebase -eq 'NOT_CONNECTED' -and $response.hasQr -eq $false){$ready=$true;break}
        }catch{
          Start-Sleep -Milliseconds 200
        }
      }
      if(!$ready){throw 'Synthetic localhost demo failed to become ready.'}
      $state=Invoke-RestMethod -Uri ($base+'/demo/state?scenario=offline') -Headers $headers -TimeoutSec 3
      if($state.source -ne 'SYNTHETIC FIXTURE' -or $state.deliveryEnabled -ne $false -or $state.hardwareControlEnabled -ne $false){throw 'Unsafe demo fixture during restart test.'}
      $qr=Invoke-WebRequest -Uri ($base+'/qr') -Headers $headers -SkipHttpErrorCheck -TimeoutSec 3
      if([int]$qr.StatusCode -ne 404){throw 'A real pairing endpoint must not exist in the offline rehearsal.'}
      Write-Host ('Offline demo process cycle '+$cycle+' validated (no pairing, messages or live sensor reads).')
    }finally{
      if($null -ne $child){
        $child.Refresh()
        if(!$child.HasExited){
          Stop-Process -Id $child.Id -Force -ErrorAction Stop
          $child.WaitForExit(5000) | Out-Null
        }
      }
    }
  }
  Write-Host 'Synthetic Windows process restart recovery PASS. No real bot or storage touched.'
}finally{
  [Environment]::SetEnvironmentVariable('DEMO_PORT',$oldPort,'Process')
}
