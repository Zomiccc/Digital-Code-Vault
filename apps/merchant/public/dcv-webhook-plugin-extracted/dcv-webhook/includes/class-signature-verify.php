<?php
/**
 * Signature Verification — verifies incoming X-Webhook-Signature from the platform.
 *
 * Implements Scheme B (inbound delivery verification) — see SIGNING.md.
 * The platform's deliverWebhook computes:
 *
 *   signature = HMAC_SHA256(endpointSecret, rawBody)  // hex
 *
 * where rawBody is the exact JSON string sent in the HTTP body, and
 * endpointSecret is the `secret` returned at registration.
 *
 * @package DCV_Webhook
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class DCV_Webhook_Signature_Verify {

    /**
     * Verifies an X-Webhook-Signature header against the raw request body.
     *
     * @param string $raw_body         The exact raw body bytes received (JSON string).
     * @param string $signature_header The value of X-Webhook-Signature (hex).
     * @param string $endpoint_secret  The endpoint secret returned at registration.
     * @return bool True if the signature matches, false otherwise.
     */
    public static function verify( $raw_body, $signature_header, $endpoint_secret ) {
        if ( empty( $signature_header ) || ! is_string( $signature_header ) ) {
            return false;
        }

        $expected = hash_hmac( 'sha256', $raw_body, $endpoint_secret );

        return hash_equals( $expected, $signature_header );
    }

    /**
     * Reads the raw request body from php://input.
     *
     * Must be called before any JSON parsing or body reading by WordPress.
     * In the REST API context, we hook into 'rest_pre_dispatch' to capture
     * the body early.
     *
     * @return string Raw body contents.
     */
    public static function read_raw_body() {
        return file_get_contents( 'php://input' );
    }
}
