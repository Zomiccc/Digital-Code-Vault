<?php
/**
 * API Client — signs and sends requests to the Digital Code Vault API.
 *
 * Implements Scheme A (outbound request signing) — see SIGNING.md.
 * The server's ApiKeyGuard computes:
 *
 *   data = METHOD\nPATH\nBODY\nTIMESTAMP
 *   signature = HMAC_SHA256(apiKey, data)  // hex
 *
 * where `apiKey` is the full API key string (pk_xxx.yyy), `path` includes
 * the /api/v1 prefix, and `body` is the exact raw JSON string sent as the
 * request body (empty string for GET/DELETE requests with no body).
 *
 * @package DCV_Webhook
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class DCV_Webhook_API_Client {

    /**
     * The merchant's full API key (pk_xxx.yyy).
     *
     * @var string
     */
    protected $api_key;

    /**
     * Base API URL including /api/v1.
     *
     * @var string
     */
    protected $base_url;

    /**
     * Constructor.
     *
     * @param string $api_key  Full API key string.
     * @param string $base_url API base URL including /api/v1.
     */
    public function __construct( $api_key, $base_url ) {
        $this->api_key  = $api_key;
        $this->base_url = rtrim( $base_url, '/' );
    }

    /**
     * Builds the canonical string for HMAC signing.
     *
     * @param string $method    Uppercase HTTP method.
     * @param string $path      Request path (e.g. /api/v1/webhooks/endpoints).
     * @param string $body      Exact raw request body string (empty for GET/DELETE).
     * @param string $timestamp Epoch-millisecond timestamp string.
     * @return string Canonical string: METHOD\nPATH\nBODY\nTIMESTAMP
     */
    protected function build_canonical_string( $method, $path, $body, $timestamp ) {
        return strtoupper( $method ) . "\n" . $path . "\n" . $body . "\n" . $timestamp;
    }

    /**
     * Computes the HMAC-SHA256 signature (hex) for a request.
     *
     * The HMAC key is the API key itself — see SIGNING.md.
     *
     * @param string $method    HTTP method.
     * @param string $path      Request path including /api/v1 prefix.
     * @param string $body      Exact raw request body string (empty for GET/DELETE).
     * @param string $timestamp Epoch-millisecond timestamp string.
     * @return string Hex-encoded HMAC-SHA256 signature.
     */
    protected function sign_request( $method, $path, $body, $timestamp ) {
        $data = $this->build_canonical_string( $method, $path, $body, $timestamp );
        return hash_hmac( 'sha256', $data, $this->api_key );
    }

    /**
     * Derives the signed path and full URL from the base URL and endpoint suffix.
     *
     * @param string $suffix Endpoint path (e.g. /webhooks/endpoints).
     * @return array { @type string $url Full URL, @type string $path Path for signing }
     */
    protected function resolve_endpoint( $suffix ) {
        $suffix    = '/' . ltrim( $suffix, '/' );
        $full_url  = $this->base_url . $suffix;
        $parsed    = wp_parse_url( $full_url );
        $path      = $parsed['path'];
        if ( isset( $parsed['query'] ) && $parsed['query'] ) {
            $path .= '?' . $parsed['query'];
        }
        return array(
            'url'  => $full_url,
            'path' => $path,
        );
    }

    /**
     * Registers a webhook endpoint with the platform.
     *
     * Sends a signed POST /api/v1/webhooks/endpoints request.
     *
     * @param string $url               The URL the platform should deliver events to.
     * @param bool   $skip_verification Whether to skip the challenge-response check.
     * @return array|WP_Error Response body on success, WP_Error on failure.
     */
    public function register_endpoint( $url, $skip_verification = false ) {
        $suffix    = '/webhooks/endpoints';
        $resolved  = $this->resolve_endpoint( $suffix );
        $timestamp = strval( round( microtime( true ) * 1000 ) );
        $body      = wp_json_encode(
            array(
                'url'               => $url,
                'skipVerification'  => (bool) $skip_verification,
            )
        );
        $signature = $this->sign_request( 'POST', $resolved['path'], $body, $timestamp );

        $headers = array(
            'Content-Type'  => 'application/json',
            'X-Api-Key'     => $this->api_key,
            'X-Timestamp'   => $timestamp,
            'X-Signature'   => $signature,
        );

        dcv_webhook_log(
            'register',
            'Sending signed registration request.',
            array(
                'url'         => $resolved['url'],
                'method'      => 'POST',
                'signed_path' => $resolved['path'],
            )
        );

        $response = wp_remote_post(
            $resolved['url'],
            array(
                'headers' => $headers,
                'body'    => $body,
                'timeout' => 30,
            )
        );

        if ( is_wp_error( $response ) ) {
            dcv_webhook_log(
                'register',
                'Network error during registration.',
                array( 'error' => $response->get_error_message() )
            );
            return $response;
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $raw_body    = wp_remote_retrieve_body( $response );

        if ( $status_code < 200 || $status_code >= 300 ) {
            $parsed = json_decode( $raw_body, true );
            $code   = isset( $parsed['code'] ) ? $parsed['code'] : 'UNKNOWN';
            $msg    = isset( $parsed['message'] ) ? $parsed['message'] : $raw_body;

            dcv_webhook_log(
                'register',
                "Registration failed (HTTP {$status_code}).",
                array( 'status' => $status_code, 'code' => $code, 'message' => $msg )
            );

            return new WP_Error(
                'dcv_register_failed',
                sprintf( 'Registration failed: %s (HTTP %d, code: %s)', $msg, $status_code, $code ),
                array( 'status' => $status_code, 'body' => $raw_body )
            );
        }

        $result = json_decode( $raw_body, true );

        if ( ! is_array( $result ) || ! isset( $result['id'] ) ) {
            dcv_webhook_log( 'register', 'Registration response missing expected fields.', array( 'body' => $raw_body ) );
            return new WP_Error( 'dcv_register_invalid_response', 'Invalid response from server.', array( 'body' => $raw_body ) );
        }

        dcv_webhook_log(
            'register',
            'Registration successful.',
            array( 'id' => $result['id'], 'status' => $result['status'], 'url' => $result['url'] )
        );

        return $result;
    }

    /**
     * Lists the merchant's registered webhook endpoints.
     *
     * @return array|WP_Error Array of endpoints on success, WP_Error on failure.
     */
    public function list_endpoints() {
        $suffix    = '/webhooks/endpoints';
        $resolved  = $this->resolve_endpoint( $suffix );
        $timestamp = strval( round( microtime( true ) * 1000 ) );
        $signature = $this->sign_request( 'GET', $resolved['path'], '', $timestamp );

        $headers = array(
            'X-Api-Key'   => $this->api_key,
            'X-Timestamp' => $timestamp,
            'X-Signature' => $signature,
        );

        $response = wp_remote_get(
            $resolved['url'],
            array(
                'headers' => $headers,
                'timeout' => 30,
            )
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $raw_body    = wp_remote_retrieve_body( $response );

        if ( $status_code < 200 || $status_code >= 300 ) {
            return new WP_Error( 'dcv_list_failed', "List failed (HTTP {$status_code})", array( 'body' => $raw_body ) );
        }

        return json_decode( $raw_body, true );
    }

    /**
     * Deletes a registered webhook endpoint.
     *
     * @param string $endpoint_id The endpoint ID returned at registration.
     * @return bool|WP_Error True on success, WP_Error on failure.
     */
    public function delete_endpoint( $endpoint_id ) {
        $suffix    = '/webhooks/endpoints/' . rawurlencode( $endpoint_id );
        $resolved  = $this->resolve_endpoint( $suffix );
        $timestamp = strval( round( microtime( true ) * 1000 ) );
        $signature = $this->sign_request( 'DELETE', $resolved['path'], '', $timestamp );

        $headers = array(
            'X-Api-Key'   => $this->api_key,
            'X-Timestamp' => $timestamp,
            'X-Signature' => $signature,
        );

        $response = wp_remote_request(
            $resolved['url'],
            array(
                'method'  => 'DELETE',
                'headers' => $headers,
                'timeout' => 30,
            )
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $status_code = wp_remote_retrieve_response_code( $response );

        if ( $status_code < 200 || $status_code >= 300 ) {
            $raw_body = wp_remote_retrieve_body( $response );
            return new WP_Error( 'dcv_delete_failed', "Delete failed (HTTP {$status_code})", array( 'body' => $raw_body ) );
        }

        dcv_webhook_log( 'delete', 'Webhook endpoint deleted.', array( 'id' => $endpoint_id ) );
        return true;
    }

    /**
     * Forwards an event to the platform's incoming webhook URL.
     *
     * This is NOT a signed request — the platform's /webhooks/incoming endpoint
     * auto-detects the provider from headers. We send WooCommerce-style headers
     * so ProviderDetector identifies it correctly.
     *
     * @param string $incoming_url The full /api/v1/webhooks/incoming URL.
     * @param array  $payload       The event payload.
     * @param array  $extra_headers Optional extra headers (e.g. X-WC-Webhook-Source).
     * @return bool|WP_Error True on success, WP_Error on failure.
     */
    public function forward_incoming( $incoming_url, $payload, $extra_headers = array() ) {
        $body = wp_json_encode( $payload );

        $headers = array_merge(
            array( 'Content-Type' => 'application/json' ),
            $extra_headers
        );

        dcv_webhook_log(
            'forward_incoming',
            'Forwarding event to platform incoming webhook.',
            array( 'url' => $incoming_url, 'payload_size' => strlen( $body ) )
        );

        $response = wp_remote_post(
            $incoming_url,
            array(
                'headers' => $headers,
                'body'    => $body,
                'timeout' => 30,
            )
        );

        if ( is_wp_error( $response ) ) {
            dcv_webhook_log(
                'forward_incoming',
                'Network error while forwarding event.',
                array( 'error' => $response->get_error_message() )
            );
            return $response;
        }

        $status_code = wp_remote_retrieve_response_code( $response );

        if ( $status_code < 200 || $status_code >= 300 ) {
            $raw_body = wp_remote_retrieve_body( $response );
            dcv_webhook_log(
                'forward_incoming',
                "Forward failed (HTTP {$status_code}).",
                array( 'status' => $status_code, 'body' => substr( $raw_body, 0, 500 ) )
            );
            return new WP_Error( 'dcv_forward_failed', "Forward failed (HTTP {$status_code})", array( 'body' => $raw_body ) );
        }

        dcv_webhook_log( 'forward_incoming', 'Event forwarded successfully.', array( 'status' => $status_code ) );
        return true;
    }
}
