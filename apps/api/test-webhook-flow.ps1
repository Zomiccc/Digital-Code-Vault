$ErrorActionPreference = 'Stop'

# Admin login
$adminBody = @{
    email = 'admin@digitalcode.local'
    password = 'ac35b19310c53df035b617ecfb6a9c2d'
} | ConvertTo-Json
$admin = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/admin/login' -Method POST -Body $adminBody -ContentType 'application/json' -TimeoutSec 10
$atoken = $admin.access_token

# Merchant login (use the test merchant that has wallet balance)
$mbody = @{
    email = 'merchant@test.com'
    password = 'Merchant123!@#'
} | ConvertTo-Json
$mres = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/merchant/login' -Method POST -Body $mbody -ContentType 'application/json' -TimeoutSec 10
$mtoken = $mres.access_token
$merchantId = $mres.user.merchantId

# Get merchant wallet before
$mwalletBefore = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
Write-Host "MERCHANT BALANCE BEFORE: $($mwalletBefore.balance)"

# Get admin wallet before
$walletBefore = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "ADMIN BALANCE BEFORE: $($walletBefore.balance)"

# Get connected products to find a mapped SKU
$connected = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/connected-products' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
Write-Host "`nCONNECTED PRODUCTS: $($connected.Count) found"
if ($connected.Count -gt 0) {
    $cp = $connected[0]
    Write-Host "  SKU: $($cp.sku)"
    Write-Host "  Product: $($cp.productName)"
    Write-Host "  Denomination: $($cp.denominationValue)"
}

# Get webhook endpoints to find the secret
$webhooks = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/endpoints' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
Write-Host "`nWEBHOOK ENDPOINTS: $($webhooks.Count) found"
if ($webhooks.Count -gt 0) {
    $ep = $webhooks[0]
    Write-Host "  URL: $($ep.url)"
    Write-Host "  Secret: $($ep.secret)"
    Write-Host "  ID: $($ep.id)"
}

# Simulate a WooCommerce webhook for a mapped product
$orderId = "wc-test-order-$(Get-Random)"
$eventId = "evt-$(Get-Random)"

# Build WooCommerce-style payload
$wcPayload = @{
    id = $orderId
    order_key = "wc_order_$orderId"
    status = "completed"
    payment_method = "stripe"
    payment_method_title = "Credit Card"
    billing = @{
        first_name = "Test"
        last_name = "Customer"
        email = "customer@test.com"
    }
    line_items = @(
        @{
            id = 1
            name = "PSN $50"
            sku = $connected[0].sku
            quantity = 1
            total = "50.00"
        }
    )
    currency = "USD"
    total = "50.00"
    date_created = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
} | ConvertTo-Json -Depth 5

Write-Host "`nSIMULATING WOOCOMMERCE WEBHOOK:"
Write-Host "  Order ID: $orderId"
Write-Host "  Event ID: $eventId"
Write-Host "  SKU: $($connected[0].sku)"

# Send webhook
$headers = @{
    'X-Webhook-Secret' = $webhooks[0].secret
    'X-Webhook-Event' = 'order.created'
    'X-Webhook-Event-Id' = $eventId
    'Content-Type' = 'application/json'
}

try {
    $whRes = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/incoming' -Method POST -Body $wcPayload -Headers $headers -TimeoutSec 30
    Write-Host "`nWEBHOOK RESPONSE:"
    Write-Host "  Status: $($whRes.status)"
    Write-Host "  Webhook ID: $($whRes.id)"
} catch {
    Write-Host "`nWEBHOOK ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
}

# Wait for async processing
Write-Host "`nWaiting 5s for async processing..."
Start-Sleep -Seconds 5

# Check merchant wallet after
$mwalletAfter = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
Write-Host "`nMERCHANT BALANCE AFTER: $($mwalletAfter.balance) (should be $($mwalletBefore.balance) - 50 = $( [decimal]$mwalletBefore.balance - 50))"

# Check admin wallet after
$walletAfter = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "ADMIN BALANCE AFTER: $($walletAfter.balance) (should be $($walletBefore.balance) + 50 = $( [decimal]$walletBefore.balance + 50))"

# Check reconciliation
$recon = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet/reconciliation?limit=50&offset=0' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "`nRECONCILIATION:"
Write-Host "  Summary: $($recon.summary | ConvertTo-Json -Compress)"
if ($recon.items) {
    foreach ($item in $recon.items) {
        Write-Host "  Item: $($item | ConvertTo-Json -Compress)"
    }
}

# Now test duplicate webhook (same eventId)
Write-Host "`n--- DUPLICATE WEBHOOK TEST ---"
try {
    $dupRes = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/incoming' -Method POST -Body $wcPayload -Headers $headers -TimeoutSec 10
    Write-Host "DUPLICATE RESPONSE: $($dupRes | ConvertTo-Json -Compress)"
} catch {
    Write-Host "DUPLICATE REJECTED: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
}

# Check balances unchanged after duplicate
$mwalletDup = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
Write-Host "MERCHANT BALANCE AFTER DUP: $($mwalletDup.balance) (should be same as before)"

$walletDup = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "ADMIN BALANCE AFTER DUP: $($walletDup.balance) (should be same as before)"

# Test unmapped product (PS5)
Write-Host "`n--- UNMAPPED PRODUCT TEST (PS5) ---"
$ps5OrderId = "wc-ps5-order-$(Get-Random)"
$ps5EventId = "evt-ps5-$(Get-Random)"
$ps5Payload = @{
    id = $ps5OrderId
    order_key = "wc_order_$ps5OrderId"
    status = "completed"
    payment_method = "stripe"
    billing = @{
        first_name = "Test"
        last_name = "Customer"
        email = "customer@test.com"
    }
    line_items = @(
        @{
            id = 1
            name = "PS5 Console"
            sku = "PS5-001"
            quantity = 1
            total = "499.99"
        }
    )
    currency = "USD"
    total = "499.99"
    date_created = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
} | ConvertTo-Json -Depth 5

$ps5Headers = @{
    'X-Webhook-Secret' = $webhooks[0].secret
    'X-Webhook-Event' = 'order.created'
    'X-Webhook-Event-Id' = $ps5EventId
    'Content-Type' = 'application/json'
}

try {
    $ps5Res = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/incoming' -Method POST -Body $ps5Payload -Headers $ps5Headers -TimeoutSec 10
    Write-Host "PS5 WEBHOOK RESPONSE: $($ps5Res | ConvertTo-Json -Compress)"
} catch {
    Write-Host "PS5 WEBHOOK ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
}

Start-Sleep -Seconds 3

# Check balances unchanged after PS5
$mwalletPs5 = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
Write-Host "MERCHANT BALANCE AFTER PS5: $($mwalletPs5.balance) (should be unchanged)"

$walletPs5 = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "ADMIN BALANCE AFTER PS5: $($walletPs5.balance) (should be unchanged)"

Write-Host "`n=== WEBHOOK FULFILLMENT TEST COMPLETE ==="
