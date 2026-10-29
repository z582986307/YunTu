$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop

function Get-ArgumentValue([string]$commandLine, [string]$name) {
  $pattern = '(?i)(?:^|\s)' + [regex]::Escape($name) + '(?:=|\s+)(?:"([^"]+)"|(\S+))'
  $match = [regex]::Match($commandLine, $pattern)
  if (-not $match.Success) { return $null }
  if ($match.Groups[1].Success) { return $match.Groups[1].Value }
  return $match.Groups[2].Value
}

function Test-YunTuJar([string]$jarPath) {
  if (-not $jarPath -or -not [IO.Path]::IsPathRooted($jarPath)) { return $false }
  if ([IO.Path]::GetFileName($jarPath) -in @(
    'yuntu-server.jar', 'testcasemanage-server.jar', 'agiletc-server.jar'
  )) { return $true }
  $root = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($jarPath))
  $folder = [IO.Path]::GetFileName($root)
  return $folder -match '(?i)(云图|YunTu|TestCaseManage|AgileTC)' -and
    (Test-Path -LiteralPath (Join-Path $root '停止-Windows.bat')) -and
    (Test-Path -LiteralPath (Join-Path $root 'database\data'))
}

function Stop-YunTuDatabase($target) {
  $secretFile = $target.SecretFile
  $admin = $target.Admin
  if (-not (Test-Path -LiteralPath $secretFile) -or -not (Test-Path -LiteralPath $admin)) {
    throw '缺少随包数据库的管理文件，已跳过强制结束以保护数据。'
  }
  $secure = (Get-Content -LiteralPath $secretFile -Raw).Trim() | ConvertTo-SecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $env:MYSQL_PWD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  try {
    & $admin --protocol=tcp --host=127.0.0.1 --port=$($target.Port) --user=root shutdown 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '数据库正常关闭失败，已跳过强制结束以保护数据。' }
  } finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $target.PidFile) {
    Remove-Item -LiteralPath $target.PidFile -Force
  }
}

$processes = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -in @('java.exe', 'javaw.exe', 'mariadbd.exe')
})
$applications = @()
$databases = @()
$problems = New-Object System.Collections.Generic.List[string]

foreach ($process in $processes) {
  if ($process.Name -notin @('java.exe', 'javaw.exe')) { continue }
  $jarPath = Get-ArgumentValue $process.CommandLine '-jar'
  if (-not (Test-YunTuJar $jarPath)) { continue }
  $applications += [pscustomobject]@{
    Id = $process.ProcessId
    Root = [IO.Path]::GetDirectoryName($jarPath)
    Name = [IO.Path]::GetFileName($jarPath)
  }
}

foreach ($process in $processes) {
  if ($process.Name -ne 'mariadbd.exe') { continue }
  $dataPath = Get-ArgumentValue $process.CommandLine '--datadir'
  if (-not $dataPath -or -not [IO.Path]::IsPathRooted($dataPath)) { continue }
  $dataPath = [IO.Path]::GetFullPath($dataPath).TrimEnd('\')
  $packageRoot = $null
  if ($dataPath.EndsWith('\database\data', [StringComparison]::OrdinalIgnoreCase)) {
    $packageRoot = [IO.Directory]::GetParent([IO.Directory]::GetParent($dataPath).FullName).FullName
    $expectedExe = Join-Path $packageRoot 'runtime\mariadb\bin\mariadbd.exe'
    if ($process.ExecutablePath -ine $expectedExe -or
        -not (Test-Path -LiteralPath (Join-Path $packageRoot '停止-Windows.bat')) -or
        -not (@(Get-ChildItem -LiteralPath $packageRoot -Filter '*.jar' -File -ErrorAction SilentlyContinue |
          Where-Object { Test-YunTuJar $_.FullName }).Count -gt 0)) { continue }
    $secretFile = Join-Path $packageRoot 'database\db-secret.txt'
    $pidFile = Join-Path $packageRoot 'logs\database.pid'
    $admin = Join-Path $packageRoot 'runtime\mariadb\bin\mariadb-admin.exe'
  } elseif ($dataPath.EndsWith('\运行数据\本地数据库\data', [StringComparison]::OrdinalIgnoreCase)) {
    $packageRoot = [IO.Directory]::GetParent([IO.Directory]::GetParent(
      [IO.Directory]::GetParent($dataPath).FullName).FullName).FullName
    $dbRoot = Join-Path $packageRoot '项目依赖\MariaDB\mariadb-10.11.14-winx64\bin'
    if ($process.ExecutablePath -ine (Join-Path $dbRoot 'mariadbd.exe') -or
        -not (Test-Path -LiteralPath (Join-Path $packageRoot '运行数据\本地服务\yuntu-server.jar'))) { continue }
    $secretFile = Join-Path $packageRoot '运行数据\本地数据库\db-root-secret.txt'
    $pidFile = Join-Path $packageRoot '运行数据\本地服务\logs\database.pid'
    $admin = Join-Path $dbRoot 'mariadb-admin.exe'
  } else { continue }
  $port = Get-ArgumentValue $process.CommandLine '--port'
  if (-not $port -or $port -notmatch '^\d+$') {
    $problems.Add("数据库进程 $($process.ProcessId) 缺少明确端口，未停止。")
    continue
  }
  $databases += [pscustomobject]@{
    Id = $process.ProcessId
    Root = $packageRoot
    Port = [int]$port
    SecretFile = $secretFile
    PidFile = $pidFile
    Admin = $admin
  }
}

foreach ($application in $applications) {
  try {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($application.Id)"
    if (-not $current -or -not (Test-YunTuJar (Get-ArgumentValue $current.CommandLine '-jar'))) { continue }
    Stop-Process -Id $application.Id -Force -ErrorAction Stop
    $pidFile = Join-Path $application.Root 'logs\application.pid'
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
    Write-Output "已停止YunTu应用进程 $($application.Id)。"
  } catch { $problems.Add("YunTu应用进程 $($application.Id) 未能停止：$($_.Exception.Message)") }
}

foreach ($database in $databases) {
  try {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($database.Id)"
    if (-not $current -or (Get-ArgumentValue $current.CommandLine '--datadir') -ne
        (Get-ArgumentValue ($processes | Where-Object ProcessId -eq $database.Id | Select-Object -First 1).CommandLine '--datadir')) { continue }
    Stop-YunTuDatabase $database
    Write-Output "已正常关闭YunTu数据库进程 $($database.Id)。"
  } catch { $problems.Add("YunTu数据库进程 $($database.Id) 未能正常关闭：$($_.Exception.Message)") }
}

if ($applications.Count -eq 0 -and $databases.Count -eq 0) { Write-Output '未发现正在运行的YunTu进程。' }
if ($problems.Count -gt 0) {
  $problems | ForEach-Object { [Console]::Error.WriteLine($_) }
  exit 1
}
Write-Output "完成：应用 $($applications.Count) 个，数据库 $($databases.Count) 个。"
