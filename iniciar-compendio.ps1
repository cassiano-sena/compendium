$ErrorActionPreference = 'SilentlyContinue'

$dir    = $PSScriptRoot
$perfil = Join-Path $dir 'perfil-app'
$porta  = 8080
$url    = "http://localhost:$porta"

Set-Location $dir

# Impede o server.js de abrir o navegador padrao
$env:NO_OPEN = '1'

# 1. Inicia o servidor Node oculto (logs ficam em arquivos na pasta)
$srv = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $dir `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $dir 'servidor.log') `
    -RedirectStandardError  (Join-Path $dir 'servidor-erro.log')

# 2. Espera o servidor responder (ate ~10 segundos)
for ($i = 0; $i -lt 33; $i++) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $c.Connect('127.0.0.1', $porta)
        $c.Close()
        break
    } catch {
        Start-Sleep -Milliseconds 300
    }
}

# 3. Abre o Compendio em janela de app com perfil isolado
$edgeArgs = @(
    "--user-data-dir=`"$perfil`"",
    "--app=$url",
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-mode'
)
Start-Process -FilePath 'msedge' -ArgumentList $edgeArgs

# Funcoes: acham os processos do Edge DESTE perfil e se ha janela visivel
function Get-EdgePids {
    @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
        Where-Object { $_.CommandLine -like '*perfil-app*' } |
        ForEach-Object { $_.ProcessId })
}
function Test-JanelaAberta {
    $ids = Get-EdgePids
    if ($ids.Count -eq 0) { return $false }
    $w = Get-Process -Id $ids | Where-Object { $_.MainWindowHandle -ne 0 }
    return [bool]$w
}

# 4. Espera a janela aparecer (ate 30 segundos)
for ($i = 0; $i -lt 30; $i++) {
    if (Test-JanelaAberta) { break }
    Start-Sleep -Seconds 1
}

# 5. Fica vigiando; sai quando a janela some por 2 verificacoes seguidas
$faltas = 0
while ($faltas -lt 2) {
    Start-Sleep -Seconds 1
    if (Test-JanelaAberta) { $faltas = 0 } else { $faltas++ }
}

# 6. Encerra o servidor e qualquer resto do Edge isolado
if ($srv) { & taskkill /PID $srv.Id /T /F | Out-Null }
foreach ($id in (Get-EdgePids)) { Stop-Process -Id $id -Force }
