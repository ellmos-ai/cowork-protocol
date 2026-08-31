param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^http://(127\.0\.0\.1|localhost|\[::1\]):\d+/cowork/v1/ui/?$')]
  [string]$UiUrl
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CoworkNativeIcon {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern bool DestroyIcon(IntPtr handle);
}
'@

function New-CoworkIcon([System.Drawing.Color]$Color) {
  $bitmap = New-Object System.Drawing.Bitmap 32, 32
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $brush = New-Object System.Drawing.SolidBrush $Color
  $graphics.FillEllipse($brush, 3, 3, 26, 26)
  $font = New-Object System.Drawing.Font 'Segoe UI', 13, ([System.Drawing.FontStyle]::Bold)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString('C', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 2, 1, 28, 29), $format)
  $handle = $bitmap.GetHicon()
  $icon = ([System.Drawing.Icon]::FromHandle($handle)).Clone()
  [CoworkNativeIcon]::DestroyIcon($handle) | Out-Null
  $format.Dispose()
  $font.Dispose()
  $brush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
  return $icon
}

$icons = @{
  present = New-CoworkIcon ([System.Drawing.Color]::FromArgb(15, 143, 134))
  'afk-short' = New-CoworkIcon ([System.Drawing.Color]::FromArgb(224, 157, 32))
  'afk-long' = New-CoworkIcon ([System.Drawing.Color]::FromArgb(221, 75, 57))
  waiting = New-CoworkIcon ([System.Drawing.Color]::FromArgb(117, 125, 137))
}

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = $icons.waiting
$notify.Text = 'Cowork Protocol - waiting for a session'
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$openItem = $menu.Items.Add('Open Cowork Companion')
$exitItem = $menu.Items.Add('Hide tray icon')
$notify.ContextMenuStrip = $menu
$openAction = {
  Start-Process -FilePath $UiUrl | Out-Null
}
$openItem.Add_Click($openAction)
$notify.Add_DoubleClick($openAction)
$exitItem.Add_Click({ [System.Windows.Forms.Application]::ExitThread() })

$stateUrl = "$($UiUrl.TrimEnd('/'))/state"
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1200
$timer.Add_Tick({
  try {
    $state = Invoke-RestMethod -Uri $stateUrl -Method Get -TimeoutSec 1
    $session = @($state.sessions)[0]
    if ($null -eq $session) {
      $notify.Icon = $icons.waiting
      $notify.Text = 'Cowork Protocol - waiting for a session'
      return
    }
    $presence = [string]$session.humanPresence
    if (-not $icons.ContainsKey($presence)) { $presence = 'waiting' }
    $notify.Icon = $icons[$presence]
    $label = switch ($presence) {
      'present' { 'human present' }
      'afk-short' { 'human briefly away' }
      'afk-long' { 'human away longer' }
      default { 'status unknown' }
    }
    $notify.Text = "Cowork Protocol - $label"
  } catch {
    $notify.Icon = $icons.waiting
    $notify.Text = 'Cowork Protocol - Companion offline'
  }
})
$timer.Start()

try {
  [System.Windows.Forms.Application]::Run()
} finally {
  $timer.Stop()
  $timer.Dispose()
  $notify.Visible = $false
  $notify.Dispose()
  foreach ($icon in $icons.Values) { $icon.Dispose() }
  $menu.Dispose()
}
