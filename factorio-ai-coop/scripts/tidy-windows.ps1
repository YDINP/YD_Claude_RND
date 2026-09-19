# Close the console windows left behind by finished server/crew runs.
#
# run-server.bat and run-agent.bat both end with `pause`, so when the server
# or the crew exits the window stays open forever waiting for a keypress.
# After a dozen deploys there were 47 of them. They cost nothing but they
# bury the live window, and a buried live window is one nobody checks.
#
# A window is dead when the batch has no child left but conhost. The live
# ones own a factorio.exe or a python.exe, so they are never touched.
#
# ASCII only: a .ps1 with Korean text is read as CP949 and the quoting
# breaks with no error message.
#
#     powershell -File scripts\tidy-windows.ps1
#     powershell -File scripts\tidy-windows.ps1 -WhatIf

param([switch]$WhatIf)

$all = Get-CimInstance Win32_Process
$ours = $all | Where-Object {
    $_.Name -eq 'cmd.exe' -and $_.CommandLine -and
    ($_.CommandLine -like '*run-server.bat*' -or $_.CommandLine -like '*run-agent.bat*')
}

$dead = @()
foreach ($w in $ours) {
    $kids = $all | Where-Object {
        $_.ParentProcessId -eq $w.ProcessId -and $_.Name -ne 'conhost.exe'
    }
    if (-not $kids) { $dead += $w }
}

if (-not $dead) {
    Write-Output 'nothing to tidy'
    exit 0
}

foreach ($w in $dead) {
    $what = $w.CommandLine
    if ($what.Length -gt 70) { $what = $what.Substring(0, 70) }
    Write-Output ("  {0,7}  {1}" -f $w.ProcessId, $what)
    if (-not $WhatIf) {
        try { Stop-Process -Id $w.ProcessId -Force -ErrorAction Stop } catch {}
    }
}
Write-Output ("{0} dead window(s){1}" -f $dead.Count, $(if ($WhatIf) { ' (dry run)' } else { ' closed' }))

$live = $ours | Where-Object { $dead.ProcessId -notcontains $_.ProcessId }
Write-Output ("{0} live window(s) left" -f $live.Count)
