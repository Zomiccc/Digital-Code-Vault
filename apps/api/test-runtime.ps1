$body = @{
    email = 'admin@digitalcode.local'
    password = 'ac35b19310c53df035b617ecfb6a9c2d'
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/admin/login' -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 10
    Write-Host "ADMIN LOGIN: SUCCESS"
    Write-Host "Token: $($response.access_token.Substring(0,20))..."
    $token = $response.access_token

    # Get admin wallet
    $wallet = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $token"} -TimeoutSec 10
    Write-Host "`nADMIN WALLET:"
    Write-Host "  Balance: $($wallet.balance)"
    Write-Host "  Currency: $($wallet.currency)"
    Write-Host "  Fulfillment Revenue: $($wallet.fulfillment_revenue)"
    Write-Host "  Funding Disbursed: $($wallet.funding_disbursed)"
    Write-Host "  Total Merchant Balances: $($wallet.total_merchant_balances)"

    # List merchant applications
    $apps = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/merchant-applications' -Method GET -Headers @{Authorization = "Bearer $token"} -TimeoutSec 10
    Write-Host "`nMERCHANT APPLICATIONS: $($apps.Count) found"

    # Merchant login
    $mbody = @{
        email = 'merchant@test.com'
        password = 'Merchant123!@#'
    } | ConvertTo-Json
    $mres = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/merchant/login' -Method POST -Body $mbody -ContentType 'application/json' -TimeoutSec 10
    Write-Host "`nMERCHANT LOGIN: SUCCESS"
    $mtoken = $mres.access_token
    $merchantId = $mres.user.merchantId
    Write-Host "  Merchant ID: $merchantId"

    # Get merchant wallet balance
    $mwallet = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
    Write-Host "`nMERCHANT WALLET:"
    Write-Host "  Balance: $($mwallet.balance)"

    # Create funding request for $1000
    $fbody = @{
        amount = 1000
        note = 'Demo funding request'
    } | ConvertTo-Json
    $fres = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/funding-requests' -Method POST -Body $fbody -ContentType 'application/json' -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
    Write-Host "`nFUNDING REQUEST CREATED:"
    Write-Host "  ID: $($fres.id)"
    Write-Host "  Status: $($fres.status)"
    Write-Host "  Amount: $($fres.amount)"

    # Check merchant balance unchanged
    $mwallet2 = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
    Write-Host "`nMERCHANT BALANCE AFTER REQUEST (should be unchanged): $($mwallet2.balance)"

    # Admin approves funding
    $abody = @{
        note = 'Approved for demo'
    } | ConvertTo-Json
    $ares = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/admin/wallet/funding-requests/$($fres.id)/approve" -Method POST -Body $abody -ContentType 'application/json' -Headers @{Authorization = "Bearer $token"} -TimeoutSec 10
    Write-Host "`nFUNDING APPROVED:"
    Write-Host "  $($ares | ConvertTo-Json -Compress)"

    # Check admin wallet after approval
    $wallet2 = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $token"} -TimeoutSec 10
    Write-Host "`nADMIN WALLET AFTER APPROVAL:"
    Write-Host "  Balance: $($wallet2.balance) (should be 9000)"

    # Check merchant wallet after approval
    $mwallet3 = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
    Write-Host "`nMERCHANT WALLET AFTER APPROVAL:"
    Write-Host "  Balance: $($mwallet3.balance) (should be previous + 1000)"

    # Get reconciliation report
    $recon = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet/reconciliation?limit=50&offset=0' -Method GET -Headers @{Authorization = "Bearer $token"} -TimeoutSec 10
    Write-Host "`nRECONCILIATION:"
    Write-Host "  Total Fulfillments: $($recon.summary.total_fulfillments)"
    Write-Host "  Matched: $($recon.summary.matched)"
    Write-Host "  Mismatches: $($recon.summary.mismatches)"
    Write-Host "  All Matched: $($recon.summary.all_matched)"

    Write-Host "`n=== RUNTIME VERIFICATION COMPLETE ==="

} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
}
