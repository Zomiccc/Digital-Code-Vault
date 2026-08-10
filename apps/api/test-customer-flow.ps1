$ErrorActionPreference = 'Stop'

# 1. Register a new customer
$regBody = @{
    name = 'Demo Customer'
    email = 'demo@test.com'
    password = 'Demo123!@#'
} | ConvertTo-Json

try {
    $reg = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/customer/register' -Method POST -Body $regBody -ContentType 'application/json' -TimeoutSec 10
    Write-Host "CUSTOMER REGISTER: SUCCESS"
    Write-Host "  ID: $($reg.user.id)"
    Write-Host "  Role: $($reg.user.role)"
    $ctoken = $reg.access_token
} catch {
    if ($_.Exception.Message -match 'already') {
        Write-Host "Customer already exists, logging in..."
        $loginBody = @{
            email = 'demo@test.com'
            password = 'Demo123!@#'
        } | ConvertTo-Json
        $reg = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/customer/login' -Method POST -Body $loginBody -ContentType 'application/json' -TimeoutSec 10
        Write-Host "CUSTOMER LOGIN: SUCCESS"
        $ctoken = $reg.access_token
    } else {
        Write-Host "ERROR: $($_.Exception.Message)"
        if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
        exit 1
    }
}

# 2. Get customer profile
$profile = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/customer/profile' -Method GET -Headers @{Authorization = "Bearer $ctoken"} -TimeoutSec 10
Write-Host "`nCUSTOMER PROFILE:"
Write-Host "  Name: $($profile.name)"
Write-Host "  IsMerchant: $($profile.isMerchant)"
Write-Host "  MerchantAppStatus: $($profile.merchantAppStatus)"

# 3. Submit merchant application
$appBody = @{
    storeName = 'Demo Digital Store'
    storeEmail = 'demo@test.com'
} | ConvertTo-Json
$appRes = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/customer/become-merchant' -Method POST -Body $appBody -ContentType 'application/json' -Headers @{Authorization = "Bearer $ctoken"} -TimeoutSec 10
Write-Host "`nMERCHANT APPLICATION SUBMITTED:"
Write-Host "  Status: $($appRes.status)"
Write-Host "  Message: $($appRes.message)"

# 4. Check profile shows PENDING
$profile2 = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/customer/profile' -Method GET -Headers @{Authorization = "Bearer $ctoken"} -TimeoutSec 10
Write-Host "`nCUSTOMER PROFILE AFTER APPLICATION:"
Write-Host "  MerchantAppStatus: $($profile2.merchantAppStatus)"

# 5. Admin login and review application
$adminBody = @{
    email = 'admin@digitalcode.local'
    password = 'ac35b19310c53df035b617ecfb6a9c2d'
} | ConvertTo-Json
$admin = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/admin/login' -Method POST -Body $adminBody -ContentType 'application/json' -TimeoutSec 10
$atoken = $admin.access_token

# 6. List applications
$apps = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/merchant-applications?status=PENDING' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "`nPENDING APPLICATIONS: $($apps.Count) found"
if ($apps.Count -gt 0) {
    $appToApprove = $apps[0]
    Write-Host "  App ID: $($appToApprove.id)"
    Write-Host "  Store: $($appToApprove.storeName)"
    Write-Host "  Customer: $($appToApprove.customer.name)"

    # 7. Approve application
    $approveRes = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/admin/merchant-applications/$($appToApprove.id)/approve" -Method POST -ContentType 'application/json' -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
    Write-Host "`nAPPLICATION APPROVED:"
    Write-Host "  $($approveRes | ConvertTo-Json -Compress)"

    # 8. Customer can now login as merchant (same email, same password)
    $mLoginBody = @{
        email = 'demo@test.com'
        password = 'Demo123!@#'
    } | ConvertTo-Json
    try {
        $mLogin = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/merchant/login' -Method POST -Body $mLoginBody -ContentType 'application/json' -TimeoutSec 10
        Write-Host "`nMERCHANT LOGIN (same credentials): SUCCESS"
        Write-Host "  Merchant ID: $($mLogin.user.merchantId)"
        Write-Host "  Merchant Name: $($mLogin.user.merchantName)"
    } catch {
        Write-Host "`nMERCHANT LOGIN FAILED: $($_.Exception.Message)"
        if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
    }
}

Write-Host "`n=== CUSTOMER -> MERCHANT FLOW COMPLETE ==="
