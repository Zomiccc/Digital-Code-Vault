<?php
/**
 * Plugin Name:       Digital Code Vault Webhook Connector
 * Plugin URI:        https://github.com/digitalcodevault/wp-dcv-webhook
 * Description:       Connects WooCommerce and Elementor to the Digital Code Vault platform. Registers webhook endpoints, verifies incoming deliveries, and forwards WooCommerce/Elementor events to the platform.
 * Version:           1.0.0
 * Author:            Digital Code Vault
 * License:           MIT
 * Text Domain:       dcv-webhook
 *
 * @package DCV_Webhook
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'DCV_WEBHOOK_VERSION', '1.0.0' );
define( 'DCV_WEBHOOK_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'DCV_WEBHOOK_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'DCV_WEBHOOK_OPTION_KEY', 'dcv_webhook_settings' );
define( 'DCV_WEBHOOK_ENDPOINT_OPTION', 'dcv_webhook_endpoint' );

require_once DCV_WEBHOOK_PLUGIN_DIR . 'includes/class-api-client.php';
require_once DCV_WEBHOOK_PLUGIN_DIR . 'includes/class-signature-verify.php';
require_once DCV_WEBHOOK_PLUGIN_DIR . 'includes/class-webhook-hooks.php';
require_once DCV_WEBHOOK_PLUGIN_DIR . 'admin/class-settings-page.php';

/**
 * Returns the plugin settings array with defaults applied.
 *
 * @return array {
 *     @type string $api_key    Merchant API key (pk_xxx.yyy) from the admin portal.
 *     @type string $api_url    Base URL of the DCV API including /api/v1.
 *     @type string $skip_verification  "1" or "" — whether to skip challenge verification.
 * }
 */
function dcv_webhook_get_settings() {
    $defaults = array(
        'api_key'           => '',
        'api_url'           => 'http://localhost:3000/api/v1',
        'skip_verification' => '',
    );
    $stored = get_option( DCV_WEBHOOK_OPTION_KEY, array() );
    if ( ! is_array( $stored ) ) {
        $stored = array();
    }
    return array_merge( $defaults, $stored );
}

/**
 * Returns the stored endpoint data from a successful registration.
 *
 * @return array|false {
 *     @type string $id      Endpoint ID.
 *     @type string $url     Registered URL.
 *     @type string $status  Endpoint status.
 *     @type string $secret  Endpoint secret for verifying deliveries.
 * } or false if not registered.
 */
function dcv_webhook_get_endpoint() {
    $endpoint = get_option( DCV_WEBHOOK_ENDPOINT_OPTION, false );
    if ( ! is_array( $endpoint ) ) {
        return false;
    }
    return $endpoint;
}

/**
 * Logs a message to the WordPress error log with a consistent prefix.
 * Intended for support debugging — timestamp, step, and message are always included.
 *
 * @param string $step     Short identifier for the operation (e.g. "register", "verify").
 * @param string $message  Human-readable message.
 * @param array  $details  Optional key-value details.
 */
function dcv_webhook_log( $step, $message, $details = array() ) {
    $ts = current_time( 'mysql' );
    $detail_str = '';
    if ( ! empty( $details ) ) {
        $detail_str = ' ' . wp_json_encode( $details );
    }
    error_log( "[DCV-Webhook {$ts}] [{$step}] {$message}{$detail_str}" );
}

/**
 * Activation hook — just logs. No auto-registration.
 * The merchant must paste their API key and click "Register this site" manually.
 */
function dcv_webhook_activate() {
    dcv_webhook_log( 'activate', 'Plugin activated. Merchant must configure API key and register endpoint manually.' );
}
register_activation_hook( __FILE__, 'dcv_webhook_activate' );

/**
 * Deactivation hook — logs. Does NOT delete the endpoint on the platform.
 * The merchant can delete it from the admin portal if needed.
 */
function dcv_webhook_deactivate() {
    dcv_webhook_log( 'deactivate', 'Plugin deactivated. Webhook endpoint remains registered on the platform.' );
}
register_deactivation_hook( __FILE__, 'dcv_webhook_deactivate' );

// Initialize the settings page.
new DCV_Webhook_Settings_Page();

// Initialize webhook hooks (WooCommerce + Elementor + incoming receiver).
new DCV_Webhook_Hooks();
