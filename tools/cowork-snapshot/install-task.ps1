# Registers (or re-registers) the daily Cowork data snapshot as a Windows
# scheduled task. Runs as the current user so it can use their `firebase login`.
# If the machine is off or asleep at 06:00 it runs as soon as it next wakes.
#
#   powershell -ExecutionPolicy Bypass -File tools\cowork-snapshot\install-task.ps1
#
# Remove with:  Unregister-ScheduledTask -TaskName "CEXindex Cowork Snapshot"

$taskName = "CEXindex Cowork Snapshot"
$script = Join-Path $PSScriptRoot "export.js"
$node = (Get-Command node).Source

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -Command `"& '$node' '$script'`""
$trigger = New-ScheduledTaskTrigger -Daily -At 6:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Exports the CEXindex Realtime Database to Cowork OS\Resources\Coffee\CEXindex Data, overwriting the previous export." -Force | Out-Null

Write-Output "Registered '$taskName' - daily at 06:00"
