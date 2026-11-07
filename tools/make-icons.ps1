# Генератор иконок расширения: скруглённый фиолетовый квадрат + "2K"
Add-Type -AssemblyName System.Drawing

function New-Icon {
    param([int]$Size, [string]$Path)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # Скруглённый квадрат с градиентом (фиолетовый Twitch)
    $outer = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $outer,
        [System.Drawing.Color]::FromArgb(255, 155, 92, 255),
        [System.Drawing.Color]::FromArgb(255, 105, 36, 220),
        65)
    $r = [double]$Size * 0.22
    $d = $r * 2
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddArc(0, 0, $d, $d, 180, 90)
    $gp.AddArc($Size - $d, 0, $d, $d, 270, 90)
    $gp.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
    $gp.AddArc(0, $Size - $d, $d, $d, 90, 90)
    $gp.CloseFigure()
    $g.FillPath($brush, $gp)

    # Тонкое белое кольцо сверху слева — намёк на глобус/локацию
    $penW = [math]::Max(2, [int]($Size * 0.045))
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(190, 255, 255, 255), $penW)
    $cx = $Size * 0.50; $cy = $Size * 0.46; $rad = $Size * 0.30
    $g.DrawEllipse($pen, ($cx - $rad), ($cy - $rad), ($rad * 2), ($rad * 2))
    $g.DrawLine($pen, ($cx - $rad), $cy, ($cx + $rad), $cy)
    $g.DrawEllipse($pen, ($cx - $rad * 0.45), ($cy - $rad), ($rad * 0.9), ($rad * 2))

    # "2K"
    $fontSize = [double]$Size * 0.40
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF(0, ($Size * 0.16), $Size, ($Size * 0.72))
    $g.DrawString('2K', $font, [System.Drawing.Brushes]::White, $textRect, $sf)

    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "OK $Path"
}

New-Icon 96 "$PSScriptRoot\..\icons\icon96.png"
New-Icon 48 "$PSScriptRoot\..\icons\icon48.png"
New-Icon 32 "$PSScriptRoot\..\icons\icon32.png"
