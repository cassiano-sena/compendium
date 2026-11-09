$Port = 8080
$PublicDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "public"))
$Url = "http://localhost:$Port/"

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($Url)
$Listener.Start()

Write-Host "====================================================" -ForegroundColor Yellow
Write-Host "   COMPENDIO RPG - SERVIDOR LOCAL INICIADO!         " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Yellow
Write-Host "Acesse no navegador: http://localhost:$Port" -ForegroundColor Cyan
Write-Host "Mantenha esta janela aberta enquanto usa o Compendio."
Write-Host "Feche a janela ou pressione Ctrl+C para encerrar."
Write-Host "====================================================" -ForegroundColor Yellow

if (-not $env:NO_OPEN) {
    Start-Process "http://localhost:$Port"
}

$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".txt"  = "text/plain; charset=utf-8"
    ".md"   = "text/plain; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"
    ".gif"  = "image/gif"
    ".bmp"  = "image/bmp"
    ".avif" = "image/avif"
    ".svg"  = "image/svg+xml; charset=utf-8"
    ".mp3"  = "audio/mpeg"
    ".ogg"  = "audio/ogg"
    ".opus" = "audio/ogg"
}

function Get-SafePublicPath([string]$RelPath) {
    $Clean = ($RelPath -replace '^\.?[\\/]+', '')
    $Resolved = [System.IO.Path]::GetFullPath((Join-Path $PublicDir $Clean))
    if (-not $Resolved.StartsWith($PublicDir, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Caminho invalido fora da pasta public."
    }
    return $Resolved
}

try {
    while ($Listener.IsListening) {
        $Context = $Listener.GetContext()
        $Request = $Context.Request
        $Response = $Context.Response
        $PathName = [System.Uri]::UnescapeDataString($Request.Url.AbsolutePath)

        try {
            if ($Request.HttpMethod -eq "GET" -and $PathName -eq "/api/status") {
                $Bytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true,"mode":"powershell","writable":true}')
                $Response.ContentType = "application/json; charset=utf-8"
                $Response.StatusCode = 200
                $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
                $Response.Close()
                continue
            }

            if ($Request.HttpMethod -eq "POST" -and $PathName -eq "/api/save") {
                $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                $Body = $Reader.ReadToEnd()
                $Reader.Close()

                $Payload = $Body | ConvertFrom-Json

                if ($Payload.files) {
                    foreach ($File in $Payload.files) {
                        if (-not $File.path) { continue }
                        $Target = Get-SafePublicPath $File.path
                        $Dir = [System.IO.Path]::GetDirectoryName($Target)
                        if (-not (Test-Path $Dir)) {
                            New-Item -ItemType Directory -Path $Dir -Force | Out-Null
                        }
                        if ($File.base64) {
                            $CleanB64 = ($File.base64 -replace '^data:[^;]+;base64,', '')
                            $FileBytes = [System.Convert]::FromBase64String($CleanB64)
                            [System.IO.File]::WriteAllBytes($Target, $FileBytes)
                        } elseif ($null -ne $File.content) {
                            $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                            [System.IO.File]::WriteAllText($Target, [string]$File.content, $Utf8NoBom)
                        }
                    }
                }

                if ($Payload.compendioData) {
                    $DadosPath = Get-SafePublicPath "dados.js"
                    $JsonStr = $Payload.compendioData | ConvertTo-Json -Depth 20
                    $JsContent = "const compendioData = $JsonStr;`n"
                    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                    [System.IO.File]::WriteAllText($DadosPath, $JsContent, $Utf8NoBom)
                }

                $RespBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true,"message":"Salvo com sucesso!"}')
                $Response.ContentType = "application/json; charset=utf-8"
                $Response.StatusCode = 200
                $Response.OutputStream.Write($RespBytes, 0, $RespBytes.Length)
                $Response.Close()
                continue
            }

            $ReqFile = if ($PathName -eq "/") { "/index.html" } else { $PathName }
            $FullPath = Get-SafePublicPath $ReqFile

            if (Test-Path $FullPath -PathType Leaf) {
                $Ext = [System.IO.Path]::GetExtension($FullPath).ToLower()
                $Response.ContentType = if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" }
                $Response.Headers.Add("Cache-Control", "no-cache")
                $FileBytes = [System.IO.File]::ReadAllBytes($FullPath)
                $Response.StatusCode = 200
                $Response.OutputStream.Write($FileBytes, 0, $FileBytes.Length)
            } else {
                $Response.StatusCode = 404
                $ErrBytes = [System.Text.Encoding]::UTF8.GetBytes("Arquivo nao encontrado")
                $Response.OutputStream.Write($ErrBytes, 0, $ErrBytes.Length)
            }
        } catch {
            $Response.StatusCode = 500
            $ErrObj = @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json
            $ErrBytes = [System.Text.Encoding]::UTF8.GetBytes($ErrObj)
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.OutputStream.Write($ErrBytes, 0, $ErrBytes.Length)
        } finally {
            $Response.Close()
        }
    }
} finally {
    $Listener.Stop()
}

