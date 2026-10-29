param([int]$EditorPid)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DshEditorCapture {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[void][DshEditorCapture]::SetProcessDPIAware()
$p = Get-Process -Id $EditorPid -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero -or -not [DshEditorCapture]::IsWindowVisible($h)) { throw 'Editor has no visible main window yet.' }
if ([DshEditorCapture]::IsIconic($h)) { throw 'Editor window is minimized. Restore it before capture; no desktop fallback was used.' }
[uint32]$ownerId = 0
[void][DshEditorCapture]::GetWindowThreadProcessId($h, [ref]$ownerId)
if ($ownerId -ne $EditorPid) { throw 'Window process identity changed.' }
$r = New-Object DshEditorCapture+Rect
if (-not [DshEditorCapture]::GetWindowRect($h, [ref]$r)) { throw 'Cannot read editor window bounds.' }
$w = $r.Right - $r.Left; $height = $r.Bottom - $r.Top
if ($w -lt 1 -or $height -lt 1 -or $w -gt 8192 -or $height -gt 8192 -or [long]$w * $height -gt 24000000) { throw 'Editor window dimensions exceed capture limits.' }
$bitmap = New-Object System.Drawing.Bitmap($w, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$stream = New-Object System.IO.MemoryStream
try {
 $dc = $graphics.GetHdc()
 try { $ok = [DshEditorCapture]::PrintWindow($h, $dc, 2) } finally { $graphics.ReleaseHdc($dc) }
 if (-not $ok) { throw 'Window capture failed; no desktop fallback was used.' }
 $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
 if ($stream.Length -gt 8388608) { throw 'Screenshot exceeds 8 MiB.' }
 @{ pid=$EditorPid; title=$p.MainWindowTitle; width=$w; height=$height; data=[Convert]::ToBase64String($stream.ToArray()); method='PrintWindow' } | ConvertTo-Json -Compress
} finally { $graphics.Dispose(); $bitmap.Dispose(); $stream.Dispose() }
