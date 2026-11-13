param(
    [int]$Port = 0
)
if ($Port -le 0) {
    if ($env:PORT -and ($env:PORT -as [int])) {
        $Port = [int]$env:PORT
    } else {
        $Port = 8080
    }
}
$PublicDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "public"))
$Url = "http://localhost:$Port/"

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($Url)
try { $Listener.Prefixes.Add("http://127.0.0.1:$Port/") } catch {}
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

$SessionStateFile = Join-Path $PublicDir "session-state.json"

$SessionState = @{
    sessionId        = "local-session"
    players          = @()
    characters       = @()
    tabletop         = $null
    knowledge        = @{}
    compendioData    = $null
    quests           = @()
    hitDice          = @()
    combatCards      = @()
    combatTurn       = @{ activeCardId = $null; round = 1 }
    diceLog          = @()
    rules            = $null
    activeMods       = @()
    lastPing         = $null
    lastStudyRequest = $null
    roomConfig       = @{
        isOpen                 = $true
        isLocked               = $false
        roomName               = "Mesa de Campanha"
        roomCode               = ("MESA-" + (Get-Random -Minimum 1000 -Maximum 9999))
        passcode               = ""
        maxPlayers             = 8
        blockRemoteGm          = $true
        allowSelfProfileCreate = $true
        bannedEntries          = @()
        createdAt              = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
    updatedAt        = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

$ActiveClients = @{}
$KickedDevices = @{}

function Save-PersistedSession {
    try {
        $ToSave = @{
            sessionId     = $SessionState.sessionId
            roomConfig    = $SessionState.roomConfig
            players       = $SessionState.players
            characters    = $SessionState.characters
            tabletop      = $SessionState.tabletop
            knowledge     = $SessionState.knowledge
            compendioData = $SessionState.compendioData
            quests        = $SessionState.quests
            hitDice       = $SessionState.hitDice
            combatCards   = $SessionState.combatCards
            combatTurn    = $SessionState.combatTurn
            rules         = $SessionState.rules
            activeMods    = $SessionState.activeMods
            updatedAt     = $SessionState.updatedAt
        }
        $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($SessionStateFile, ($ToSave | ConvertTo-Json -Depth 32), $Utf8NoBom)
    } catch {}
}

function Load-PersistedSession {
    if (-not (Test-Path $SessionStateFile -PathType Leaf)) { return }
    try {
        $Raw = [System.IO.File]::ReadAllText($SessionStateFile, [System.Text.Encoding]::UTF8)
        $Parsed = $Raw | ConvertFrom-Json
        if ($null -ne $Parsed) {
            if ($null -ne $Parsed.roomConfig) {
                $rc = $Parsed.roomConfig
                if ($null -ne $rc.isOpen) { $SessionState.roomConfig.isOpen = [bool]$rc.isOpen }
                if ($null -ne $rc.isLocked) { $SessionState.roomConfig.isLocked = [bool]$rc.isLocked }
                if ($rc.roomName) { $SessionState.roomConfig.roomName = [string]$rc.roomName }
                if ($rc.roomCode) { $SessionState.roomConfig.roomCode = [string]$rc.roomCode }
                if ($null -ne $rc.passcode) { $SessionState.roomConfig.passcode = [string]$rc.passcode }
                if ($rc.maxPlayers) { $SessionState.roomConfig.maxPlayers = [int]$rc.maxPlayers }
                if ($null -ne $rc.blockRemoteGm) { $SessionState.roomConfig.blockRemoteGm = [bool]$rc.blockRemoteGm }
                if ($null -ne $rc.allowSelfProfileCreate) { $SessionState.roomConfig.allowSelfProfileCreate = [bool]$rc.allowSelfProfileCreate }
                if ($null -ne $rc.bannedEntries) { $SessionState.roomConfig.bannedEntries = @($rc.bannedEntries) }
            }
            if ($null -ne $Parsed.players) { $SessionState.players = @($Parsed.players) }
            if ($null -ne $Parsed.characters) { $SessionState.characters = @($Parsed.characters) }
            if ($null -ne $Parsed.tabletop) { $SessionState.tabletop = $Parsed.tabletop }
            if ($null -ne $Parsed.knowledge) { $SessionState.knowledge = $Parsed.knowledge }
            if ($null -ne $Parsed.compendioData) { $SessionState.compendioData = $Parsed.compendioData }
            if ($null -ne $Parsed.quests) { $SessionState.quests = @($Parsed.quests) }
            if ($null -ne $Parsed.hitDice) { $SessionState.hitDice = @($Parsed.hitDice) }
            if ($null -ne $Parsed.combatCards) { $SessionState.combatCards = @($Parsed.combatCards) }
            if ($null -ne $Parsed.combatTurn) { $SessionState.combatTurn = $Parsed.combatTurn }
            if ($null -ne $Parsed.rules) { $SessionState.rules = $Parsed.rules }
            if ($null -ne $Parsed.activeMods) { $SessionState.activeMods = @($Parsed.activeMods) }
        }
    } catch {}
}

Load-PersistedSession

function Load-DefaultDadosCompendium {
    if ($null -ne $SessionState.compendioData) { return }
    try {
        $DadosPath = Join-Path $PublicDir "dados.js"
        if (-not (Test-Path $DadosPath -PathType Leaf)) { return }
        $Raw = [System.IO.File]::ReadAllText($DadosPath, [System.Text.Encoding]::UTF8)
        $Cleaned = ($Raw -replace '^\s*(?:const|let|var)\s+compendioData\s*=\s*', '') -replace ';\s*$', ''
        $Parsed = $Cleaned.Trim() | ConvertFrom-Json
        if ($null -ne $Parsed) { $SessionState.compendioData = $Parsed }
    } catch {}
}

Load-DefaultDadosCompendium

function Get-SafePublicPath([string]$RelPath) {
    $Clean = ($RelPath -replace '^\.?[\\/]+', '')
    $Resolved = [System.IO.Path]::GetFullPath((Join-Path $PublicDir $Clean))
    if (-not $Resolved.StartsWith($PublicDir, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Caminho invalido fora da pasta public."
    }
    return $Resolved
}

function Send-JsonResponse($Response, [int]$StatusCode, $Object) {
    $JsonStr = $Object | ConvertTo-Json -Depth 20 -Compress
    $Bytes = [System.Text.Encoding]::UTF8.GetBytes($JsonStr)
    $Response.ContentType = "application/json; charset=utf-8"
    $Response.Headers.Set("Cache-Control", "no-store")
    $Response.StatusCode = $StatusCode
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Response.Close()
}

function Get-ClientIp($Request) {
    try {
        if ($Request.RemoteEndPoint -and $Request.RemoteEndPoint.Address) {
            return [string]$Request.RemoteEndPoint.Address.ToString()
        }
    } catch {}
    return "unknown"
}

function Test-IsHostRequest($Request) {
    $Ip = (Get-ClientIp $Request).ToLower()
    return ($Ip -eq "127.0.0.1" -or $Ip -eq "::1" -or $Ip -eq "::ffff:127.0.0.1" -or $Ip.StartsWith("127."))
}

function Get-HashedIdentifier([string]$Raw) {
    $Sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $Bytes = [System.Text.Encoding]::UTF8.GetBytes("compendio-rpg-privacy-salt:" + $Raw)
        $Hash = $Sha.ComputeHash($Bytes)
        return ([System.BitConverter]::ToString($Hash) -replace '-', '').ToLower().Substring(0, 24)
    } finally {
        $Sha.Dispose()
    }
}

function Get-HostNetworkAddresses {
    $Lan = @()
    $Vpn = @()
    try {
        foreach ($Nic in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
            if ($Nic.OperationalStatus -ne [System.Net.NetworkInformation.OperationalStatus]::Up) { continue }
            if ($Nic.NetworkInterfaceType -eq [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback) { continue }
            $Name = $Nic.Name
            $Props = $Nic.GetIPProperties()
            foreach ($Uni in $Props.UnicastAddresses) {
                if ($Uni.Address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { continue }
                $Ip = $Uni.Address.IPAddressToString
                if ($Ip.StartsWith("127.")) { continue }
                $Parts = $Ip.Split('.') | ForEach-Object { [int]$_ }
                $IsCgnat = ($Parts[0] -eq 100 -and $Parts[1] -ge 64 -and $Parts[1] -le 127)
                $IsRadmin = ($Parts[0] -eq 26)
                $IsHamachi = ($Parts[0] -eq 25)
                $IsVpnName = ($Name -imatch 'tailscale|radmin|zerotier|hamachi|wireguard|tun|tap|vpn|wg')
                $Entry = @{
                    interfaceName = $Name
                    ip            = $Ip
                    url           = "http://${Ip}:$Port"
                }
                if ($IsCgnat -or $IsRadmin -or $IsHamachi -or $IsVpnName) {
                    $Vpn += $Entry
                } else {
                    $Lan += $Entry
                }
            }
        }
    } catch {}
    return @{ port = [int]$Port; lan = @($Lan); vpn = @($Vpn) }
}

function Get-SanitizedRoom([bool]$IsHost) {
    $Rc = $SessionState.roomConfig
    $Bans = @($Rc.bannedEntries)
    $Base = @{
        isOpen                 = [bool]$Rc.isOpen
        isLocked               = [bool]$Rc.isLocked
        roomName               = if ($Rc.roomName) { [string]$Rc.roomName } else { "Mesa de Campanha" }
        roomCode               = if ($Rc.roomCode) { [string]$Rc.roomCode } else { "MESA-0000" }
        hasPasscode            = [bool]$Rc.passcode
        maxPlayers             = [Math]::Max(1, [int]$Rc.maxPlayers)
        blockRemoteGm          = ($Rc.blockRemoteGm -ne $false)
        allowSelfProfileCreate = ($Rc.allowSelfProfileCreate -ne $false)
        createdAt              = $Rc.createdAt
        bannedCount            = $Bans.Count
    }
    if ($IsHost) {
        $Base.passcode = if ($Rc.passcode) { [string]$Rc.passcode } else { "" }
        $Base.bannedEntries = @($Bans | ForEach-Object {
            @{
                id       = $_.id
                deviceId = $_.deviceId
                playerId = $_.playerId
                label    = if ($_.label) { $_.label } else { "Jogador Banido" }
                reason   = if ($_.reason) { $_.reason } else { "Banido pelo Mestre" }
                bannedAt = $_.bannedAt
            }
        })
    }
    return $Base
}

function Get-ObjectPropNames($Obj) {
    if ($null -eq $Obj) { return @() }
    if ($Obj -is [System.Collections.IDictionary]) { return @($Obj.Keys) }
    if ($Obj -is [string] -or $Obj.GetType().IsPrimitive) { return @() }
    return @($Obj.PSObject.Properties | ForEach-Object { $_.Name })
}

function Get-ObjectPropValue($Obj, [string]$Key) {
    if ($null -eq $Obj) { return $null }
    if ($Obj -is [System.Collections.IDictionary]) {
        if ($Obj.Contains($Key)) { return $Obj[$Key] }
        return $null
    }
    $Prop = $Obj.PSObject.Properties[$Key]
    if ($null -ne $Prop) { return $Prop.Value }
    return $null
}

function Set-ObjectPropValue($Obj, [string]$Key, $Val) {
    if ($null -eq $Obj) { return }
    if ($Obj -is [System.Collections.IDictionary]) {
        $Obj[$Key] = $Val
        return
    }
    $Obj | Add-Member -MemberType NoteProperty -Name $Key -Value $Val -Force
}

function Test-EntryVisibleToAnyRemotePlayer([string]$Cat, [string]$ItemKey, $Knowledge) {
    $K = "${Cat}:$ItemKey"
    $Rec = Get-ObjectPropValue $Knowledge $K
    if ($null -eq $Rec) { return ($Cat -ne "session") }
    $GlobalLvl = Get-ObjectPropValue $Rec "globalLevel"
    if ($GlobalLvl -eq "sighted" -or $GlobalLvl -eq "studied") { return $true }
    $Pl = Get-ObjectPropValue $Rec "playerLevels"
    foreach ($PName in (Get-ObjectPropNames $Pl)) {
        $Lvl = Get-ObjectPropValue $Pl $PName
        if ($Lvl -eq "sighted" -or $Lvl -eq "studied") { return $true }
    }
    return $false
}

function Get-SanitizedCatalogNodeForRemote([string]$Cat, $NodeObj, $Knowledge) {
    $Out = [ordered]@{}
    if ($null -eq $NodeObj) { return $Out }
    foreach ($Key in (Get-ObjectPropNames $NodeObj)) {
        $Val = Get-ObjectPropValue $NodeObj $Key
        if ($null -eq $Val) { continue }
        $Children = Get-ObjectPropValue $Val "children"
        $HasChildren = ($null -ne $Children) -and (($Children -is [System.Collections.IDictionary]) -or ($Children -is [PSObject] -and -not ($Children -is [string])))
        if ($HasChildren) {
            $Sub = Get-SanitizedCatalogNodeForRemote $Cat $Children $Knowledge
            if ($Sub.Count -gt 0) {
                $Clone = [ordered]@{}
                foreach ($P in (Get-ObjectPropNames $Val)) {
                    $Clone[$P] = Get-ObjectPropValue $Val $P
                }
                $Clone["children"] = $Sub
                $Out[$Key] = $Clone
            }
        } elseif (Test-EntryVisibleToAnyRemotePlayer $Cat $Key $Knowledge) {
            if ($Val -is [System.Collections.IDictionary] -or ($Val -is [PSObject] -and -not ($Val -is [string]))) {
                $Clone = [ordered]@{}
                $InlineVal = Get-ObjectPropValue $Val "inlineContent"
                $PathVal = Get-ObjectPropValue $Val "path"
                $StripInline = ($InlineVal -is [string]) -and ($InlineVal.Length -gt 260000) -and [bool]$PathVal
                foreach ($P in (Get-ObjectPropNames $Val)) {
                    if ($StripInline -and $P -eq "inlineContent") { continue }
                    $Clone[$P] = Get-ObjectPropValue $Val $P
                }
                $Out[$Key] = $Clone
            } else {
                $Out[$Key] = $Val
            }
        }
    }
    return $Out
}

function Get-SanitizedCompendioForRemotePlayers($Compendio, $Knowledge) {
    if ($null -eq $Compendio) { return $null }
    $Out = [ordered]@{}
    foreach ($Cat in (Get-ObjectPropNames $Compendio)) {
        $Entries = Get-ObjectPropValue $Compendio $Cat
        if ($null -eq $Entries) { continue }
        $Out[$Cat] = Get-SanitizedCatalogNodeForRemote $Cat $Entries $Knowledge
    }
    return $Out
}

$CompendiumDirMap = [ordered]@{
    monster = "monsters"
    npc     = "npcs"
    map     = "maps"
    item    = "items"
    curio   = "curio"
    session = "session"
}

function Get-NaturalSortKey([string]$Name) {
    return [regex]::Replace($Name.ToLower(), '\d+', { param($m) $m.Value.PadLeft(10, '0') })
}

function ConvertTo-SlugKey([string]$Name, [bool]$IsDir = $false) {
    $Base = if ($IsDir) { $Name } else { [System.IO.Path]::GetFileNameWithoutExtension($Name) }
    $Norm = $Base.ToLower().Normalize([System.Text.NormalizationForm]::FormD)
    $Sb = New-Object System.Text.StringBuilder
    foreach ($Ch in $Norm.ToCharArray()) {
        if ([System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($Ch) -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$Sb.Append($Ch)
        }
    }
    $Slug = ($Sb.ToString() -replace '[^a-z0-9]+', '-').Trim('-')
    if (-not $Slug) { return "item" }
    return $Slug
}

function ConvertTo-PrettyCatalogTitle([string]$Name, [bool]$StripExt = $false) {
    $Raw = if ($StripExt) { [System.IO.Path]::GetFileNameWithoutExtension($Name) } else { $Name }
    $Clean = ($Raw -replace '[-_]+', ' ' -replace '\s+', ' ').Trim()
    if (-not $Clean) { return "Sem Titulo" }
    return [regex]::Replace($Clean, '\b[a-z\u00e0-\u00ff]', { param($m) $m.Value.ToUpper() })
}

function Test-IsDocExt([string]$Ext) {
    return @('.json', '.html', '.htm', '.txt', '.md').Contains($Ext)
}

function Test-IsImgExt([string]$Ext) {
    return @('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.avif').Contains($Ext)
}

function Get-ExtractedTitleAndInline([string]$FullPath, [string]$RelWebPath) {
    $FileName = [System.IO.Path]::GetFileName($FullPath)
    $Ext = [System.IO.Path]::GetExtension($FullPath).ToLower()
    $Title = ConvertTo-PrettyCatalogTitle $FileName $true
    $Inline = $null
    try {
        $Info = Get-Item -Path $FullPath -ErrorAction Stop
        if ($Ext -eq '.json') {
            if ($Info.Length -le 2097152) {
                $Raw = [System.IO.File]::ReadAllText($FullPath, [System.Text.Encoding]::UTF8)
                try {
                    $CleanedJson = ($Raw -replace '^\uFEFF', '').Trim()
                    $Parsed = $CleanedJson | ConvertFrom-Json
                    $ItemObj = $null
                    if ($Parsed -is [System.Array] -and $Parsed.Count -gt 0) { $ItemObj = $Parsed[0] }
                    elseif ($Parsed.monster -and $Parsed.monster.Count -gt 0) { $ItemObj = $Parsed.monster[0] }
                    elseif ($Parsed.item -and $Parsed.item.Count -gt 0) { $ItemObj = $Parsed.item[0] }
                    elseif ($Parsed.npc -and $Parsed.npc.Count -gt 0) { $ItemObj = $Parsed.npc[0] }
                    else { $ItemObj = $Parsed }
                    if ($null -ne $ItemObj) {
                        $CandName = Get-ObjectPropValue $ItemObj "name"
                        if (-not $CandName) { $CandName = Get-ObjectPropValue $ItemObj "title" }
                        if ($CandName -is [string] -and $CandName.Trim()) { $Title = $CandName.Trim() }
                    }
                } catch {}
                if ($Raw.Length -le 260000) { $Inline = $Raw }
            }
            $Entry = [ordered]@{ title = $Title; tipo = "json"; path = $RelWebPath }
            if ($Inline) { $Entry["inlineContent"] = $Inline }
            return $Entry
        }
        if ($Ext -eq '.html' -or $Ext -eq '.htm') {
            if ($Info.Length -le 2097152) {
                $Raw = [System.IO.File]::ReadAllText($FullPath, [System.Text.Encoding]::UTF8)
                $M = [regex]::Match($Raw, '<h1[^>]*>([\s\S]*?)</h1>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                if (-not $M.Success) {
                    $M = [regex]::Match($Raw, '<title[^>]*>([\s\S]*?)</title>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                }
                if ($M.Success) {
                    $Stripped = (($M.Groups[1].Value -replace '<[^>]+>', ' ') -replace '\s+', ' ').Trim()
                    if ($Stripped -and $Stripped.Length -le 100) { $Title = $Stripped }
                }
                if ($Raw.Length -le 260000) { $Inline = $Raw }
            }
            $Entry = [ordered]@{ title = $Title; tipo = "html"; path = $RelWebPath }
            if ($Inline) { $Entry["inlineContent"] = $Inline }
            return $Entry
        }
        if ($Ext -eq '.txt' -or $Ext -eq '.md' -or $Ext -eq '.svg') {
            if ($Info.Length -le 260000) {
                $Inline = [System.IO.File]::ReadAllText($FullPath, [System.Text.Encoding]::UTF8)
            }
            $Entry = [ordered]@{ title = $Title; tipo = $Ext.TrimStart('.'); path = $RelWebPath }
            if ($Inline) { $Entry["inlineContent"] = $Inline }
            return $Entry
        }
    } catch {}
    $FallbackType = $Ext.TrimStart('.')
    if (-not $FallbackType) { $FallbackType = "file" }
    return [ordered]@{ title = $Title; tipo = $FallbackType; path = $RelWebPath }
}

function Merge-NestedLeavesInto($TargetObj, $NodeObj) {
    foreach ($K in (Get-ObjectPropNames $NodeObj)) {
        $V = Get-ObjectPropValue $NodeObj $K
        if ($null -eq $V) { continue }
        $Ch = Get-ObjectPropValue $V "children"
        $HasChildren = ($null -ne $Ch) -and (($Ch -is [System.Collections.IDictionary]) -or ($Ch -is [PSObject] -and -not ($Ch -is [string])))
        if ($HasChildren) {
            Merge-NestedLeavesInto $TargetObj $Ch
        } elseif ($null -eq (Get-ObjectPropValue $TargetObj $K)) {
            $TargetObj[$K] = $V
        }
    }
}

function Invoke-WalkCompendiumFolder([string]$Cat, [string]$DirAbsPath, [string]$DirWebRelPath, [bool]$IsCategoryRoot = $false) {
    if (-not (Test-Path $DirAbsPath -PathType Container)) { return [ordered]@{} }
    $Entries = @(Get-ChildItem -Path $DirAbsPath -Force | Where-Object { -not $_.Name.StartsWith('.') } | Sort-Object { Get-NaturalSortKey $_.Name })
    $Subdirs = @($Entries | Where-Object { $_.PSIsContainer })
    $Files = @($Entries | Where-Object { -not $_.PSIsContainer })
    $DocFiles = @($Files | Where-Object { Test-IsDocExt $_.Extension.ToLower() })
    $ImgFiles = @($Files | Where-Object { Test-IsImgExt $_.Extension.ToLower() })

    if (-not $IsCategoryRoot -and $Subdirs.Count -eq 0) {
        if ($Cat -eq "monsters" -or $Cat -eq "npcs" -or $Cat -eq "items") {
            $DistinctDocSlugs = @($DocFiles | ForEach-Object { ConvertTo-SlugKey $_.Name $false } | Select-Object -Unique)
            if ($DistinctDocSlugs.Count -eq 1 -or ($DocFiles.Count -eq 0 -and $ImgFiles.Count -ge 1)) {
                $Chosen = ($DocFiles | Where-Object { $_.Extension.ToLower() -eq '.json' } | Select-Object -First 1)
                if (-not $Chosen) { $Chosen = ($DocFiles | Where-Object { @('.html', '.htm').Contains($_.Extension.ToLower()) } | Select-Object -First 1) }
                if (-not $Chosen -and $DocFiles.Count -gt 0) { $Chosen = $DocFiles[0] }
                if (-not $Chosen) { $Chosen = ($ImgFiles | Where-Object { $_.Name -notmatch '-art\.' } | Select-Object -First 1) }
                if (-not $Chosen -and $ImgFiles.Count -gt 0) { $Chosen = $ImgFiles[0] }
                if ($Chosen) {
                    $FolderName = [System.IO.Path]::GetFileName($DirAbsPath)
                    $Key = ConvertTo-SlugKey $FolderName $true
                    $Full = $Chosen.FullName
                    $Rel = "${DirWebRelPath}/$($Chosen.Name)"
                    return @{ __singleEntity = $true; key = $Key; entry = (Get-ExtractedTitleAndInline $Full $Rel) }
                }
            }
        } elseif ($Cat -eq "maps" -and ($DocFiles.Count + $ImgFiles.Count) -eq 1) {
            $Chosen = if ($DocFiles.Count -gt 0) { $DocFiles[0] } else { $ImgFiles[0] }
            if ($Chosen) {
                $FolderName = [System.IO.Path]::GetFileName($DirAbsPath)
                $Key = ConvertTo-SlugKey $FolderName $true
                $Full = $Chosen.FullName
                $Rel = "${DirWebRelPath}/$($Chosen.Name)"
                return @{ __singleEntity = $true; key = $Key; entry = (Get-ExtractedTitleAndInline $Full $Rel) }
            }
        }
    }

    $Collection = [ordered]@{}
    foreach ($Sd in $Subdirs) {
        $SubAbs = $Sd.FullName
        $SubWeb = "${DirWebRelPath}/$($Sd.Name)"
        $Res = Invoke-WalkCompendiumFolder $Cat $SubAbs $SubWeb $false
        $IsSingle = ($Res -is [System.Collections.IDictionary]) -and $Res.Contains("__singleEntity") -and $Res["__singleEntity"]
        if ($IsSingle) {
            $Collection[$Res["key"]] = $Res["entry"]
        } elseif ($null -ne $Res -and (Get-ObjectPropNames $Res).Count -gt 0) {
            if ($IsCategoryRoot) {
                $FKey = ConvertTo-SlugKey $Sd.Name $true
                $Collection[$FKey] = [ordered]@{
                    title    = (ConvertTo-PrettyCatalogTitle $Sd.Name $false)
                    children = $Res
                }
            } else {
                Merge-NestedLeavesInto $Collection $Res
            }
        }
    }

    $LeafCandidates = if ($Cat -eq "maps") {
        @($DocFiles + $ImgFiles)
    } elseif ($Cat -eq "curio" -or $Cat -eq "session") {
        @($DocFiles)
    } else {
        if ($DocFiles.Count -gt 0) { @($DocFiles) } else { @($ImgFiles) }
    }

    foreach ($Lf in $LeafCandidates) {
        $Ext = $Lf.Extension.ToLower()
        $K = ConvertTo-SlugKey $Lf.Name $false
        if ($Ext -ne '.json') {
            $HasJsonSibling = $false
            foreach ($Other in $LeafCandidates) {
                if ($Other.Extension.ToLower() -eq '.json' -and (ConvertTo-SlugKey $Other.Name $false) -eq $K) {
                    $HasJsonSibling = $true
                    break
                }
            }
            if ($HasJsonSibling) { continue }
        }
        $Rel = "${DirWebRelPath}/$($Lf.Name)"
        if ($null -eq (Get-ObjectPropValue $Collection $K)) {
            $Collection[$K] = Get-ExtractedTitleAndInline $Lf.FullName $Rel
        }
    }

    return $Collection
}

function Get-LeafEntriesCount($NodeObj) {
    if ($null -eq $NodeObj) { return 0 }
    $Total = 0
    foreach ($K in (Get-ObjectPropNames $NodeObj)) {
        $V = Get-ObjectPropValue $NodeObj $K
        if ($null -eq $V) { continue }
        $Ch = Get-ObjectPropValue $V "children"
        $HasChildren = ($null -ne $Ch) -and (($Ch -is [System.Collections.IDictionary]) -or ($Ch -is [PSObject] -and -not ($Ch -is [string])))
        if ($HasChildren) {
            $Total += Get-LeafEntriesCount $Ch
        } else {
            $Total++
        }
    }
    return $Total
}

function Invoke-ScanCompendiumDirectories {
    $Scanned = [ordered]@{ monsters = [ordered]@{}; npcs = [ordered]@{}; maps = [ordered]@{}; items = [ordered]@{}; curio = [ordered]@{}; session = [ordered]@{} }
    $Counts = [ordered]@{ monsters = 0; npcs = 0; maps = 0; items = 0; curio = 0; session = 0 }
    foreach ($FolderName in $CompendiumDirMap.Keys) {
        $CatKey = $CompendiumDirMap[$FolderName]
        $AbsDir = Join-Path $PublicDir $FolderName
        if (Test-Path $AbsDir -PathType Container) {
            $Tree = Invoke-WalkCompendiumFolder $CatKey $AbsDir "./$FolderName" $true
            $Scanned[$CatKey] = $Tree
            $Counts[$CatKey] = Get-LeafEntriesCount $Tree
        }
    }
    return @{ scanned = $Scanned; counts = $Counts }
}

function Merge-CatalogCollections($TargetCatObj, $ScannedCatObj) {
    $Result = [ordered]@{}
    foreach ($K in (Get-ObjectPropNames $TargetCatObj)) {
        $Result[$K] = Get-ObjectPropValue $TargetCatObj $K
    }
    foreach ($K in (Get-ObjectPropNames $ScannedCatObj)) {
        $V = Get-ObjectPropValue $ScannedCatObj $K
        $Existing = Get-ObjectPropValue $Result $K
        $VCh = if ($null -ne $V) { Get-ObjectPropValue $V "children" } else { $null }
        $ExCh = if ($null -ne $Existing) { Get-ObjectPropValue $Existing "children" } else { $null }
        if ($null -ne $VCh -and $null -ne $ExCh) {
            $ExTitle = Get-ObjectPropValue $Existing "title"
            $VTitle = Get-ObjectPropValue $V "title"
            $Result[$K] = [ordered]@{
                title    = if ($ExTitle) { $ExTitle } else { $VTitle }
                children = (Merge-CatalogCollections $ExCh $VCh)
            }
        } elseif ($null -eq $Existing) {
            $Result[$K] = $V
        }
    }
    return $Result
}

function Apply-ScannedVisibility([string]$CatKey, $NodeObj, $KnowledgeObj, [string]$VisLevel) {
    if ($null -eq $NodeObj -or -not $VisLevel) { return }
    foreach ($K in (Get-ObjectPropNames $NodeObj)) {
        $V = Get-ObjectPropValue $NodeObj $K
        if ($null -eq $V) { continue }
        $Ch = Get-ObjectPropValue $V "children"
        $HasChildren = ($null -ne $Ch) -and (($Ch -is [System.Collections.IDictionary]) -or ($Ch -is [PSObject] -and -not ($Ch -is [string])))
        if ($HasChildren) {
            Apply-ScannedVisibility $CatKey $Ch $KnowledgeObj $VisLevel
        } else {
            $KnowKey = "${CatKey}:$K"
            if ($null -eq (Get-ObjectPropValue $KnowledgeObj $KnowKey)) {
                Set-ObjectPropValue $KnowledgeObj $KnowKey @{ globalLevel = $VisLevel; playerLevels = @{} }
            }
        }
    }
}

function Get-SanitizedSession([bool]$IsHost) {
    $PlayersOut = if ($IsHost) {
        @($SessionState.players)
    } else {
        @($SessionState.players | ForEach-Object {
            @{
                id            = $_.id
                name          = $_.name
                role          = $_.role
                color         = $_.color
                avatarEmoji   = $_.avatarEmoji
                streamerAlias = $_.streamerAlias
                hasPin        = [bool]$_.pin
            }
        })
    }
    $CompData = if ($IsHost) {
        $SessionState.compendioData
    } else {
        Get-SanitizedCompendioForRemotePlayers $SessionState.compendioData $SessionState.knowledge
    }
    return @{
        sessionId        = $SessionState.sessionId
        players          = $PlayersOut
        characters       = @($SessionState.characters)
        tabletop         = $SessionState.tabletop
        knowledge        = $SessionState.knowledge
        compendioData    = $CompData
        quests           = @($SessionState.quests)
        hitDice          = @($SessionState.hitDice)
        combatCards      = @($SessionState.combatCards)
        combatTurn       = $SessionState.combatTurn
        diceLog          = @($SessionState.diceLog)
        rules            = $SessionState.rules
        activeMods       = @($SessionState.activeMods)
        lastPing         = $SessionState.lastPing
        lastStudyRequest = $SessionState.lastStudyRequest
        roomConfig       = (Get-SanitizedRoom $IsHost)
        updatedAt        = $SessionState.updatedAt
    }
}

function Test-ClientBanned($Request, [string]$DeviceId, [string]$PlayerId = "") {
    if (Test-IsHostRequest $Request) { return $null }
    $IpHash = Get-HashedIdentifier (Get-ClientIp $Request)
    foreach ($B in @($SessionState.roomConfig.bannedEntries)) {
        if ($DeviceId -and $B.deviceId -and $B.deviceId -eq $DeviceId) { return $B }
        if ($B.ipHash -and $B.ipHash -eq $IpHash) { return $B }
        if ($PlayerId -and $PlayerId -ne "gm-master" -and $B.playerId -and $B.playerId -eq $PlayerId) { return $B }
    }
    return $null
}

function Test-RoomPasscode($Request, [string]$Passcode = "") {
    if (Test-IsHostRequest $Request) { return $true }
    $Expected = [string]$SessionState.roomConfig.passcode
    if (-not $Expected) { return $true }
    return ($Passcode -eq $Expected)
}

function Update-ActiveClientsCleanup {
    $Now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    foreach ($Key in @($ActiveClients.Keys)) {
        if (($Now - $ActiveClients[$Key].lastSeen) -gt 20000) {
            $ActiveClients.Remove($Key)
        }
    }
}

function Get-OnlinePlayersList {
    Update-ActiveClientsCleanup
    return @($ActiveClients.Values | ForEach-Object {
        @{
            clientId    = $_.clientId
            deviceId    = $_.deviceId
            playerId    = $_.playerId
            playerName  = $_.playerName
            role        = $_.role
            color       = $_.color
            avatarEmoji = $_.avatarEmoji
            isHost      = [bool]$_.isHost
            connectedAt = $_.connectedAt
        }
    })
}

function Get-QueryParam($Request, [string]$Key) {
    $RawQuery = $Request.Url.Query
    if (-not $RawQuery) { return "" }
    $Trimmed = $RawQuery.TrimStart('?')
    foreach ($Pair in $Trimmed.Split('&')) {
        if (-not $Pair) { continue }
        $Kv = $Pair.Split('=', 2)
        $K = [System.Uri]::UnescapeDataString(($Kv[0].Replace('+', ' ')))
        if ($K -eq $Key) {
            if ($Kv.Count -gt 1) { return [System.Uri]::UnescapeDataString(($Kv[1].Replace('+', ' '))) }
            return ""
        }
    }
    return ""
}

try {
    while ($Listener.IsListening) {
        $Context = $Listener.GetContext()
        $Request = $Context.Request
        $Response = $Context.Response
        $PathName = [System.Uri]::UnescapeDataString($Request.Url.AbsolutePath)
        $IsHost = Test-IsHostRequest $Request

        try {
            if ($Request.HttpMethod -eq "GET" -and $PathName -eq "/api/status") {
                $Online = Get-OnlinePlayersList
                Send-JsonResponse $Response 200 @{
                    ok               = $true
                    mode             = "powershell"
                    writable         = $true
                    multiplayerReady = $true
                    sseReady         = $false
                    isHostClient     = $IsHost
                    port             = [int]$Port
                    room             = (Get-SanitizedRoom $IsHost)
                    onlineCount      = $Online.Count
                    onlinePlayers    = $Online
                }
                continue
            }

            if ($Request.HttpMethod -eq "GET" -and $PathName -eq "/api/host-network") {
                if (-not $IsHost) {
                    Send-JsonResponse $Response 403 @{ ok = $false; error = "Apenas o computador Host pode consultar seus enderecos de rede." }
                    continue
                }
                Send-JsonResponse $Response 200 @{ ok = $true; network = (Get-HostNetworkAddresses) }
                continue
            }

            if ($Request.HttpMethod -eq "POST" -and $PathName -eq "/api/room/verify-passcode") {
                $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                $Body = $Reader.ReadToEnd()
                $Reader.Close()
                $Incoming = if ($Body) { $Body | ConvertFrom-Json } else { @{} }
                $DeviceId = [string]$Incoming.deviceId
                $Banned = Test-ClientBanned $Request $DeviceId ""
                if ($null -ne $Banned) {
                    Send-JsonResponse $Response 403 @{ ok = $false; banned = $true; error = $Banned.reason }
                    continue
                }
                if (-not $SessionState.roomConfig.isOpen -and -not $IsHost) {
                    Send-JsonResponse $Response 403 @{ ok = $false; closed = $true; error = "A sala online foi encerrada pelo Mestre." }
                    continue
                }
                if (-not (Test-RoomPasscode $Request ([string]$Incoming.passcode))) {
                    Send-JsonResponse $Response 401 @{ ok = $false; error = "Senha ou codigo de acesso da sala incorreto." }
                    continue
                }
                Send-JsonResponse $Response 200 @{ ok = $true; room = (Get-SanitizedRoom $IsHost) }
                continue
            }

            if ($Request.HttpMethod -eq "POST" -and $PathName -eq "/api/room/manage") {
                if (-not $IsHost) {
                    Send-JsonResponse $Response 403 @{ ok = $false; error = "Apenas o Mestre no computador Host pode gerenciar a sala online." }
                    continue
                }
                $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                $Body = $Reader.ReadToEnd()
                $Reader.Close()
                $Incoming = if ($Body) { $Body | ConvertFrom-Json } else { @{} }
                $Action = [string]$Incoming.action
                $Rc = $SessionState.roomConfig

                if ($Action -eq "open" -or $Action -eq "create_or_update") {
                    $Rc.isOpen = $true
                    if ($Incoming.roomName) { $Rc.roomName = ([string]$Incoming.roomName).Trim() }
                    if ($null -ne $Incoming.passcode) { $Rc.passcode = ([string]$Incoming.passcode).Trim() }
                    if ($null -ne $Incoming.maxPlayers) { $Rc.maxPlayers = [Math]::Max(1, [Math]::Min(16, [int]$Incoming.maxPlayers)) }
                    if ($null -ne $Incoming.isLocked) { $Rc.isLocked = [bool]$Incoming.isLocked }
                    if ($null -ne $Incoming.blockRemoteGm) { $Rc.blockRemoteGm = [bool]$Incoming.blockRemoteGm }
                    if ($null -ne $Incoming.allowSelfProfileCreate) { $Rc.allowSelfProfileCreate = [bool]$Incoming.allowSelfProfileCreate }
                    if ($Incoming.regenerateCode) { $Rc.roomCode = ("MESA-" + (Get-Random -Minimum 1000 -Maximum 9999)) }
                } elseif ($Action -eq "toggle_lock") {
                    $Rc.isLocked = if ($null -ne $Incoming.locked) { [bool]$Incoming.locked } else { -not [bool]$Rc.isLocked }
                } elseif ($Action -eq "close") {
                    $Rc.isOpen = $false
                    foreach ($K in @($ActiveClients.Keys)) {
                        if (-not $ActiveClients[$K].isHost) { $ActiveClients.Remove($K) }
                    }
                } elseif ($Action -eq "kick") {
                    $TargetCid = [string]$Incoming.targetClientId
                    $TargetDid = [string]$Incoming.targetDeviceId
                    foreach ($K in @($ActiveClients.Keys)) {
                        if ($ActiveClients[$K].isHost) { continue }
                        if (($TargetCid -and $ActiveClients[$K].clientId -eq $TargetCid) -or ($TargetDid -and $ActiveClients[$K].deviceId -eq $TargetDid)) {
                            if ($ActiveClients[$K].deviceId) { $KickedDevices[$ActiveClients[$K].deviceId] = [string]$Incoming.reason }
                            $ActiveClients.Remove($K)
                        }
                    }
                } elseif ($Action -eq "ban") {
                    $TargetCid = [string]$Incoming.targetClientId
                    $TargetDid = [string]$Incoming.targetDeviceId
                    $TargetPid = [string]$Incoming.targetPlayerId
                    $Matched = $null
                    foreach ($K in @($ActiveClients.Keys)) {
                        if ($ActiveClients[$K].isHost) { continue }
                        if (($TargetCid -and $ActiveClients[$K].clientId -eq $TargetCid) -or ($TargetDid -and $ActiveClients[$K].deviceId -eq $TargetDid)) {
                            $Matched = $ActiveClients[$K]
                            break
                        }
                    }
                    $BanRecord = @{
                        id       = ("ban-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
                        deviceId = if ($Matched -and $Matched.deviceId) { $Matched.deviceId } else { $TargetDid }
                        ipHash   = if ($Matched -and $Matched.ipHash) { $Matched.ipHash } else { "" }
                        playerId = if ($Matched -and $Matched.playerId -and $Matched.playerId -ne "gm-master") { $Matched.playerId } elseif ($TargetPid -and $TargetPid -ne "gm-master") { $TargetPid } else { "" }
                        label    = if ($Incoming.label) { [string]$Incoming.label } elseif ($Matched) { $Matched.playerName } else { "Jogador Banido" }
                        reason   = if ($Incoming.reason) { [string]$Incoming.reason } else { "Acesso bloqueado pelo Mestre da sala." }
                        bannedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                    }
                    $Rc.bannedEntries = @($Rc.bannedEntries) + $BanRecord
                    foreach ($K in @($ActiveClients.Keys)) {
                        if ($ActiveClients[$K].isHost) { continue }
                        $C = $ActiveClients[$K]
                        if (($BanRecord.deviceId -and $C.deviceId -eq $BanRecord.deviceId) -or ($BanRecord.ipHash -and $C.ipHash -eq $BanRecord.ipHash) -or ($BanRecord.playerId -and $C.playerId -eq $BanRecord.playerId)) {
                            $ActiveClients.Remove($K)
                        }
                    }
                } elseif ($Action -eq "unban") {
                    $BanId = [string]$Incoming.banId
                    $Rc.bannedEntries = @($Rc.bannedEntries | Where-Object { $_.id -ne $BanId })
                }

                $SessionState.updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                Save-PersistedSession
                Send-JsonResponse $Response 200 @{
                    ok            = $true
                    room          = (Get-SanitizedRoom $true)
                    onlinePlayers = (Get-OnlinePlayersList)
                }
                continue
            }

            if ($Request.HttpMethod -eq "GET" -and $PathName -eq "/api/scan-compendium") {
                if (-not $IsHost) {
                    Send-JsonResponse $Response 403 @{ ok = $false; error = "Apenas o Host pode escanear pastas do computador." }
                    continue
                }
                $ScanRes = Invoke-ScanCompendiumDirectories
                Send-JsonResponse $Response 200 @{
                    ok      = $true
                    counts  = $ScanRes.counts
                    scanned = $ScanRes.scanned
                }
                continue
            }

            if ($Request.HttpMethod -eq "POST" -and $PathName -eq "/api/scan-compendium") {
                if (-not $IsHost) {
                    Send-JsonResponse $Response 403 @{ ok = $false; error = "Apenas o Host pode importar pastas do servidor." }
                    continue
                }
                $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                $Body = $Reader.ReadToEnd()
                $Reader.Close()
                $Incoming = if ($Body) { $Body | ConvertFrom-Json } else { @{} }
                $Mode = if ($Incoming.mode -eq "replace") { "replace" } else { "merge" }
                $TargetCats = if ($Incoming.categories -and @($Incoming.categories).Count -gt 0) {
                    @($Incoming.categories)
                } else {
                    @("monsters", "npcs", "maps", "items", "curio", "session")
                }
                $DefaultVis = if (@("hidden", "sighted", "studied").Contains([string]$Incoming.defaultVisibility)) {
                    [string]$Incoming.defaultVisibility
                } else {
                    ""
                }

                $ScanRes = Invoke-ScanCompendiumDirectories
                $Current = [ordered]@{
                    monsters = [ordered]@{}
                    npcs     = [ordered]@{}
                    maps     = [ordered]@{}
                    items    = [ordered]@{}
                    curio    = [ordered]@{}
                    session  = [ordered]@{}
                }
                if ($null -ne $SessionState.compendioData) {
                    foreach ($Ck in @("monsters", "npcs", "maps", "items", "curio", "session")) {
                        $ExistingCat = Get-ObjectPropValue $SessionState.compendioData $Ck
                        if ($null -ne $ExistingCat) { $Current[$Ck] = $ExistingCat }
                    }
                }
                if ($null -eq $SessionState.knowledge) { $SessionState.knowledge = @{} }

                foreach ($CatKey in $TargetCats) {
                    if (-not $ScanRes.scanned.Contains($CatKey)) { continue }
                    $CatScanned = $ScanRes.scanned[$CatKey]
                    $Current[$CatKey] = if ($Mode -eq "replace") {
                        $CatScanned
                    } else {
                        Merge-CatalogCollections $Current[$CatKey] $CatScanned
                    }
                    if ($DefaultVis) {
                        Apply-ScannedVisibility $CatKey $CatScanned $SessionState.knowledge $DefaultVis
                    }
                }

                $SessionState.compendioData = $Current
                $SessionState.updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                $DadosPath = Get-SafePublicPath "dados.js"
                $JsonStr = $Current | ConvertTo-Json -Depth 32
                $JsContent = "const compendioData = $JsonStr;`n"
                $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($DadosPath, $JsContent, $Utf8NoBom)
                Save-PersistedSession

                Send-JsonResponse $Response 200 @{
                    ok            = $true
                    counts        = $ScanRes.counts
                    compendioData = $Current
                    knowledge     = $SessionState.knowledge
                    updatedAt     = $SessionState.updatedAt
                }
                continue
            }

            if ($Request.HttpMethod -eq "GET" -and $PathName -eq "/api/mods") {
                $ModsDir = Get-SafePublicPath "mods"
                if (-not (Test-Path $ModsDir)) {
                    New-Item -ItemType Directory -Path $ModsDir -Force | Out-Null
                }
                $ModList = @()
                Get-ChildItem -Path $ModsDir -File | ForEach-Object {
                    $Ext = $_.Extension.ToLower()
                    if ($Ext -eq ".json" -or $Ext -eq ".js") {
                        $Content = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
                        $Manifest = $null
                        if ($Ext -eq ".json") {
                            try { $Manifest = $Content | ConvertFrom-Json } catch {}
                        }
                        $ModList += @{
                            fileName = $_.Name
                            path     = "./mods/$($_.Name)"
                            type     = $Ext.TrimStart('.')
                            manifest = $Manifest
                        }
                    }
                }
                Send-JsonResponse $Response 200 @{ ok = $true; mods = $ModList }
                continue
            }

            if ($Request.HttpMethod -eq "GET" -and $PathName -eq "/api/session") {
                $DeviceId = Get-QueryParam $Request "deviceId"
                $Passcode = Get-QueryParam $Request "passcode"
                if (-not $Passcode -and $Request.Headers["x-room-passcode"]) { $Passcode = [string]$Request.Headers["x-room-passcode"] }
                $Banned = Test-ClientBanned $Request $DeviceId ""
                if ($null -ne $Banned) {
                    Send-JsonResponse $Response 403 @{ ok = $false; banned = $true; error = $Banned.reason }
                    continue
                }
                if ($DeviceId -and $KickedDevices.ContainsKey($DeviceId) -and -not $IsHost) {
                    $KickMsg = $KickedDevices[$DeviceId]
                    $KickedDevices.Remove($DeviceId)
                    Send-JsonResponse $Response 403 @{ ok = $false; kicked = $true; error = if ($KickMsg) { $KickMsg } else { "Desconectado da sala pelo Mestre." } }
                    continue
                }
                if (-not $SessionState.roomConfig.isOpen -and -not $IsHost) {
                    Send-JsonResponse $Response 403 @{ ok = $false; closed = $true; error = "Sala fechada." }
                    continue
                }
                if (-not (Test-RoomPasscode $Request $Passcode)) {
                    Send-JsonResponse $Response 401 @{ ok = $false; authRequired = $true; error = "Senha necessaria." }
                    continue
                }
                $ClientId = Get-QueryParam $Request "clientId"
                if ($ClientId) {
                    $ActiveClients[$ClientId] = @{
                        clientId    = $ClientId
                        deviceId    = if ($DeviceId) { $DeviceId } else { $ClientId }
                        ipHash      = (Get-HashedIdentifier (Get-ClientIp $Request))
                        playerId    = (Get-QueryParam $Request "playerId")
                        playerName  = (Get-QueryParam $Request "playerName")
                        role        = if (-not $IsHost -and $SessionState.roomConfig.blockRemoteGm -and (Get-QueryParam $Request "role") -eq "gm") { "player" } else { (Get-QueryParam $Request "role") }
                        color       = (Get-QueryParam $Request "color")
                        avatarEmoji = (Get-QueryParam $Request "avatarEmoji")
                        isHost      = $IsHost
                        connectedAt = if ($ActiveClients.ContainsKey($ClientId)) { $ActiveClients[$ClientId].connectedAt } else { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
                        lastSeen    = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                    }
                }
                Send-JsonResponse $Response 200 @{
                    ok            = $true
                    isHostClient  = $IsHost
                    session       = (Get-SanitizedSession $IsHost)
                    room          = (Get-SanitizedRoom $IsHost)
                    onlinePlayers = (Get-OnlinePlayersList)
                }
                continue
            }

            if ($Request.HttpMethod -eq "POST" -and $PathName -eq "/api/session") {
                $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                $Body = $Reader.ReadToEnd()
                $Reader.Close()

                $Incoming = $Body | ConvertFrom-Json
                $SenderCid = [string]$Incoming.clientId
                $DeviceId = if ($Incoming.deviceId) { [string]$Incoming.deviceId } else { $SenderCid }
                $SenderId = [string]$Incoming.senderId
                $Passcode = if ($Incoming.passcode) { [string]$Incoming.passcode } elseif ($Request.Headers["x-room-passcode"]) { [string]$Request.Headers["x-room-passcode"] } else { "" }

                $Banned = Test-ClientBanned $Request $DeviceId $SenderId
                if ($null -ne $Banned) {
                    Send-JsonResponse $Response 403 @{ ok = $false; banned = $true; error = $Banned.reason }
                    continue
                }
                if (-not $SessionState.roomConfig.isOpen -and -not $IsHost) {
                    Send-JsonResponse $Response 403 @{ ok = $false; closed = $true; error = "A sala esta fechada pelo Mestre." }
                    continue
                }
                if (-not (Test-RoomPasscode $Request $Passcode)) {
                    Send-JsonResponse $Response 401 @{ ok = $false; authRequired = $true; error = "Senha incorreta." }
                    continue
                }

                if ($SenderCid) {
                    $RoleOut = if ($Incoming.senderRole) { [string]$Incoming.senderRole } else { "player" }
                    if (-not $IsHost -and $SessionState.roomConfig.blockRemoteGm -and $RoleOut -eq "gm") { $RoleOut = "player" }
                    $ActiveClients[$SenderCid] = @{
                        clientId    = $SenderCid
                        deviceId    = $DeviceId
                        ipHash      = (Get-HashedIdentifier (Get-ClientIp $Request))
                        playerId    = $SenderId
                        playerName  = if ($Incoming.senderName) { [string]$Incoming.senderName } else { "Jogador" }
                        role        = $RoleOut
                        color       = if ($Incoming.senderColor) { [string]$Incoming.senderColor } else { "#d8b467" }
                        avatarEmoji = if ($Incoming.senderAvatar) { [string]$Incoming.senderAvatar } else { "🛡️" }
                        isHost      = $IsHost
                        connectedAt = if ($ActiveClients.ContainsKey($SenderCid)) { $ActiveClients[$SenderCid].connectedAt } else { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
                        lastSeen    = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                    }
                }

                $SenderIsGmClient = $IsHost -and ([string]$Incoming.senderRole -ne "player")

                if ($Incoming.delta) {
                    $d = $Incoming.delta
                    if ($d.type -eq "DICE_ROLL" -and $d.roll) {
                        $SessionState.diceLog += $d.roll
                    } elseif ($d.type -eq "DICE_CLEAR") {
                        $SessionState.diceLog = @()
                    } elseif ($d.type -eq "MAP_PING" -and $d.ping) {
                        $SessionState.lastPing = $d.ping
                    } elseif ($d.type -eq "STUDY_REQUEST" -and $d.entityKey) {
                        $SessionState.lastStudyRequest = @{
                            id          = ("sr-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
                            entityKey   = [string]$d.entityKey
                            entityTitle = if ($d.entityTitle) { [string]$d.entityTitle } else { [string]$d.entityKey }
                            playerId    = if ($d.playerId) { [string]$d.playerId } else { $SenderId }
                            playerName  = if ($d.playerName) { [string]$d.playerName } elseif ($Incoming.senderName) { [string]$Incoming.senderName } else { "Jogador" }
                            ts          = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                        }
                    }
                } else {
                    if ($null -ne $Incoming.players) { $SessionState.players = $Incoming.players }
                    if ($null -ne $Incoming.characters) { $SessionState.characters = $Incoming.characters }
                    if ($null -ne $Incoming.tabletop) { $SessionState.tabletop = $Incoming.tabletop }
                    if ($SenderIsGmClient) {
                        if ($null -ne $Incoming.knowledge) { $SessionState.knowledge = $Incoming.knowledge }
                        if ($null -ne $Incoming.compendioData) { $SessionState.compendioData = $Incoming.compendioData }
                        if ($null -ne $Incoming.quests) { $SessionState.quests = @($Incoming.quests) }
                        if ($null -ne $Incoming.hitDice) { $SessionState.hitDice = @($Incoming.hitDice) }
                    }
                    if ($null -ne $Incoming.combatCards) { $SessionState.combatCards = $Incoming.combatCards }
                    if ($null -ne $Incoming.combatTurn) { $SessionState.combatTurn = $Incoming.combatTurn }
                    if ($null -ne $Incoming.diceLog) { $SessionState.diceLog = $Incoming.diceLog }
                    if ($null -ne $Incoming.rules) { $SessionState.rules = $Incoming.rules }
                    if ($null -ne $Incoming.activeMods) { $SessionState.activeMods = $Incoming.activeMods }
                }
                $SessionState.updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                Save-PersistedSession
                Send-JsonResponse $Response 200 @{ ok = $true; updatedAt = $SessionState.updatedAt }
                continue
            }

            if ($Request.HttpMethod -eq "POST" -and $PathName -eq "/api/save") {
                if (-not $IsHost) {
                    Send-JsonResponse $Response 403 @{ ok = $false; error = "Apenas o computador Host pode gravar arquivos permanentes no disco." }
                    continue
                }
                $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                $Body = $Reader.ReadToEnd()
                $Reader.Close()

                $Payload = $Body | ConvertFrom-Json

                if ($Payload.deletePaths) {
                    foreach ($DelRel in $Payload.deletePaths) {
                        if (-not $DelRel) { continue }
                        try {
                            $DelTarget = Get-SafePublicPath $DelRel
                            if (Test-Path $DelTarget -PathType Leaf) {
                                Remove-Item -Path $DelTarget -Force
                            }
                        } catch {}
                    }
                }

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

                if ($null -ne $Payload.compendioData) {
                    $DadosPath = Get-SafePublicPath "dados.js"
                    $JsonStr = $Payload.compendioData | ConvertTo-Json -Depth 32
                    $JsContent = "const compendioData = $JsonStr;`n"
                    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                    [System.IO.File]::WriteAllText($DadosPath, $JsContent, $Utf8NoBom)
                    $SessionState.compendioData = $Payload.compendioData
                }
                if ($null -ne $Payload.knowledge) {
                    $SessionState.knowledge = $Payload.knowledge
                }
                if ($null -ne $Payload.compendioData -or $null -ne $Payload.knowledge) {
                    $SessionState.updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                    Save-PersistedSession
                }

                Send-JsonResponse $Response 200 @{ ok = $true; message = "Salvo com sucesso!" }
                continue
            }

            $ReqFile = if ($PathName -eq "/") { "/index.html" } else { $PathName }
            $FullPath = Get-SafePublicPath $ReqFile

            if ($FullPath -ieq $SessionStateFile) {
                $Response.StatusCode = 403
                $ErrBytes = [System.Text.Encoding]::UTF8.GetBytes("Acesso restrito")
                $Response.OutputStream.Write($ErrBytes, 0, $ErrBytes.Length)
                continue
            }

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
