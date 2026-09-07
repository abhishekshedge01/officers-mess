$cert = New-SelfSignedCertificate -Subject "CN=localhost, O=Officers Mess, C=IN" -DnsName "localhost", "127.0.0.1" -CertStoreLocation "Cert:\CurrentUser\My" -KeyExportPolicy Exportable -KeyLength 2048 -NotAfter (Get-Date).AddYears(5)
$sslDir = "$PSScriptRoot\..\ssl"
if (!(Test-Path $sslDir)) { New-Item -ItemType Directory -Path $sslDir -Force }
$keyPath = "$sslDir\server.key"
$certPath = "$sslDir\server.cert"

$certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$certB64 = [System.Convert]::ToBase64String($certBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
$certPem = @"
-----BEGIN CERTIFICATE-----
$certB64
-----END CERTIFICATE-----
"@
[System.IO.File]::WriteAllText($certPath, $certPem)

$rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
$keyBytes = $rsa.ExportPkcs8PrivateKey()
$keyB64 = [System.Convert]::ToBase64String($keyBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
$keyPem = @"
-----BEGIN PRIVATE KEY-----
$keyB64
-----END PRIVATE KEY-----
"@
[System.IO.File]::WriteAllText($keyPath, $keyPem)

Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)"
Write-Host "SSL Certificates generated successfully at: $sslDir"
