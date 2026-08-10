$ErrorActionPreference = 'Stop'

# Admin login
$adminBody = @{
    email = 'admin@digitalcode.local'
    password = 'ac35b19310c53df035b617ecfb6a9c2d'
} | ConvertTo-Json
$admin = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/admin/login' -Method POST -Body $adminBody -ContentType 'application/json' -TimeoutSec 10
$atoken = $admin.access_token

# Merchant login
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

# Get products and denominations from admin
$products = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/products' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "`nPRODUCTS: $($products.Count) found"
if ($products.Count -gt 0) {
    Write-Host "  First: $($products[0].name) (ID: $($products[0].id))"
}

# Get the merchant's webhook secret - we set it via fix-merchant-webhook.ts
$webhookSecret = 'whsec_demo_cevxutjck8cx0dwjabrry8'
Write-Host "`nMERCHANT: Test Merchant"
Write-Host "  Webhook Secret: $webhookSecret"

# Get connected products
$connected = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/connected-products' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
Write-Host "CONNECTED PRODUCTS: $($connected.Count) found"

# If no connected products, we need to sync one from a webhook
# First, let's send a webhook with a SKU to create a connected product
$orderId = "wc-test-order-$(Get-Random)"
$eventId = "evt-$(Get-Random)"
$testSku = "PSN-USD-50"

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
            sku = $testSku
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
Write-Host "  SKU: $testSku"
Write-Host "  Webhook Secret: $webhookSecret"

# Send webhook
$headers = @{
    'X-Webhook-Secret' = $webhookSecret
    'X-Webhook-Event' = 'order.created'
    'X-Webhook-Event-Id' = $eventId
    'X-WC-Webhook-Source' = 'https://demo-store.com'
    'X-WC-Webhook-Topic' = 'order.created'
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
Write-Host "`nWaiting 8s for async processing..."
Start-Sleep -Seconds 8

# Check merchant wallet after
$mwalletAfter = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
$expectedMerchant = [decimal]$mwalletBefore.balance - 50
Write-Host "`nMERCHANT BALANCE AFTER: $($mwalletAfter.balance) (expected: $expectedMerchant)"

# Check admin wallet after
$walletAfter = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
$expectedAdmin = [decimal]$walletBefore.balance + 50
Write-Host "ADMIN BALANCE AFTER: $($walletAfter.balance) (expected: $expectedAdmin)"

# Check reconciliation
$recon = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet/reconciliation?limit=50&offset=0' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "`nRECONCILIATION:"
Write-Host "  Summary: $($recon.summary | ConvertTo-Json -Compress)"

# Now test duplicate webhook (same eventId)
Write-Host "`n--- DUPLICATE WEBHOOK TEST (same eventId) ---"
try {
    $dupRes = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/incoming' -Method POST -Body $wcPayload -Headers $headers -TimeoutSec 10
    Write-Host "DUPLICATE RESPONSE: $($dupRes | ConvertTo-Json -Compress)"
} catch {
    Write-Host "DUPLICATE REJECTED: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
}

Start-Sleep -Seconds 2

# Check balances unchanged after duplicate
$mwalletDup = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
Write-Host "MERCHANT BALANCE AFTER DUP: $($mwalletDup.balance) (should be unchanged: $($mwalletAfter.balance))"

$walletDup = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "ADMIN BALANCE AFTER DUP: $($walletDup.balance) (should be unchanged: $($walletAfter.balance))"

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
    'X-Webhook-Secret' = $webhookSecret
    'X-Webhook-Event' = 'order.created'
    'X-Webhook-Event-Id' = $ps5EventId
    'X-WC-Webhook-Source' = 'https://demo-store.com'
    'X-WC-Webhook-Topic' = 'order.created'
    'Content-Type' = 'application/json'
}

try {
    $ps5Res = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/incoming' -Method POST -Body $ps5Payload -Headers $ps5Headers -TimeoutSec 10
    Write-Host "PS5 WEBHOOK RESPONSE: $($ps5Res | ConvertTo-Json -Compress)"
} catch {
    Write-Host "PS5 WEBHOOK ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
}

Start-Sleep -Seconds 5

# Check balances unchanged after PS5
$mwalletPs5 = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
Write-Host "MERCHANT BALANCE AFTER PS5: $($mwalletPs5.balance) (should be unchanged: $($mwalletDup.balance))"

$walletPs5 = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "ADMIN BALANCE AFTER PS5: $($walletPs5.balance) (should be unchanged: $($walletDup.balance))"

# Test similar name but unmapped SKU
Write-Host "`n--- SIMILAR NAME UNMAPPED SKU TEST ---"
$simOrderId = "wc-sim-order-$(Get-Random)"
$simEventId = "evt-sim-$(Get-Random)"
$simPayload = @{
    id = $simOrderId
    order_key = "wc_order_$simOrderId"
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
            name = "PSN Gift Card 50"
            sku = "UNMAPPED-SKU-999"
            quantity = 1
            total = "50.00"
        }
    )
    currency = "USD"
    total = "50.00"
    date_created = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
} | ConvertTo-Json -Depth 5

$simHeaders = @{
    'X-Webhook-Secret' = $webhookSecret
    'X-Webhook-Event' = 'order.created'
    'X-Webhook-Event-Id' = $simEventId
    'X-WC-Webhook-Source' = 'https://demo-store.com'
    'X-WC-Webhook-Topic' = 'order.created'
    'Content-Type' = 'application/json'
}

try {
    $simRes = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/incoming' -Method POST -Body $simPayload -Headers $simHeaders -TimeoutSec 10
    Write-Host "SIMILAR NAME WEBHOOK RESPONSE: $($simRes | ConvertTo-Json -Compress)"
} catch {
    Write-Host "SIMILAR NAME WEBHOOK ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
}

Start-Sleep -Seconds 5

# Check balances unchanged after similar name
$mwalletSim = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
Write-Host "MERCHANT BALANCE AFTER SIMILAR: $($mwalletSim.balance) (should be unchanged)"

$walletSim = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "ADMIN BALANCE AFTER SIMILAR: $($walletSim.balance) (should be unchanged)"

Write-Host "`n=== ALL WEBHOOK TESTS COMPLETE ==="
