<?php
/**
 * Uninstall — cleans up plugin options on deletion.
 *
 * @package DCV_Webhook
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}

delete_option( 'dcv_webhook_settings' );
delete_option( 'dcv_webhook_endpoint' );
delete_transient( 'dcv_webhook_notice' );
