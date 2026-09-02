<?php
/**
 * Webhook Hooks — WooCommerce + Elementor event listeners and incoming delivery receiver.
 *
 * Direction 1: WooCommerce/Elementor → Platform
 *   Hooks into WooCommerce order events and Elementor form submissions, then forwards
 *   them to the platform's /webhooks/incoming URL with WooCommerce-style headers so
 *   ProviderDetector auto-detects them.
 *
 * Direction 2: Platform → WooCommerce
 *   Registers a WP REST API endpoint that receives deliveries from the platform,
 *   verifies X-Webhook-Signature (Scheme B), and acts on the payload (e.g. marks
 *   a WooCommerce order as completed).
 *
 * @package DCV_Webhook
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

if ( ! class_exists( 'DCV_Webhook_Hooks' ) ) {
class DCV_Webhook_Hooks {

    /**
     * Constructor — registers all hooks.
     */
    public function __construct() {
        // Direction 2: Register REST endpoint for receiving platform deliveries.
        add_action( 'rest_api_init', array( $this, 'register_rest_endpoint' ) );

        // Direction 1: WooCommerce order events → Platform.
        add_action( 'woocommerce_order_status_processing', array( $this, 'on_woocommerce_order_processing' ), 10, 1 );
        add_action( 'woocommerce_order_status_completed',  array( $this, 'on_woocommerce_order_completed' ), 10, 1 );

        // Direction 1: Elementor form submissions → Platform.
        add_action( 'elementor_pro/forms/new_record', array( $this, 'on_elementor_form_submit' ), 10, 2 );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  Direction 2: Platform → WooCommerce (incoming delivery receiver)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Registers the WP REST API endpoint for receiving webhook deliveries from the platform.
     *
     * Route: /wp-json/dcv/v1/webhook
     * Method: POST
     * Permission callback: __return_true (signature verification is the auth mechanism).
     */
    public function register_rest_endpoint() {
        register_rest_route(
            'dcv/v1',
            '/webhook',
            array(
                'methods'             => 'POST',
                'callback'            => array( $this, 'handle_incoming_delivery' ),
                'permission_callback' => '__return_true',
            )
        );
    }

    /**
     * Handles an incoming webhook delivery from the platform.
     *
     * Verifies X-Webhook-Signature (Scheme B) using the stored endpoint secret,
     * then dispatches based on the event type.
     *
     * @param WP_REST_Request $request The REST request.
     * @return WP_REST_Response|WP_Error
     */
    public function handle_incoming_delivery( $request ) {
        $raw_body = $request->get_body();
        $payload  = json_decode( $raw_body, true );

        // ─── Challenge-response verification ───
        // During webhook registration, the DCV backend sends a verification request
        // with event=webhook.verification and a challenge token. We must echo it back.
        if ( is_array( $payload ) && isset( $payload['event'] ) && $payload['event'] === 'webhook.verification' ) {
            $challenge = isset( $payload['challenge'] ) ? $payload['challenge'] : '';
            dcv_webhook_log(
                'verification',
                'Received challenge-response verification request. Echoing challenge.',
                array( 'challenge_length' => strlen( $challenge ) )
            );
            return new WP_REST_Response(
                array(
                    'challenge' => $challenge,
                    'verified'  => true,
                ),
                200
            );
        }

        $endpoint = dcv_webhook_get_endpoint();

        if ( ! $endpoint || empty( $endpoint['secret'] ) ) {
            dcv_webhook_log(
                'incoming_delivery',
                'No endpoint secret stored — cannot verify delivery.',
                array()
            );
            return new WP_Error(
                'dcv_not_registered',
                'Webhook endpoint is not registered. Register this site first.',
                array( 'status' => 403 )
            );
        }

        $signature      = $request->get_header( 'x_webhook_signature' );
        $event          = $request->get_header( 'x_webhook_event' );

        if ( ! DCV_Webhook_Signature_Verify::verify( $raw_body, $signature, $endpoint['secret'] ) ) {
            dcv_webhook_log(
                'incoming_delivery',
                'Signature verification failed — rejecting delivery.',
                array(
                    'event'       => $event,
                    'has_sig'     => ! empty( $signature ),
                    'body_length' => strlen( $raw_body ),
                )
            );
            return new WP_Error(
                'dcv_invalid_signature',
                'X-Webhook-Signature verification failed.',
                array( 'status' => 401 )
            );
        }

        $payload = json_decode( $raw_body, true );

        if ( ! is_array( $payload ) ) {
            dcv_webhook_log( 'incoming_delivery', 'Invalid JSON payload.', array( 'raw' => substr( $raw_body, 0, 500 ) ) );
            return new WP_Error( 'dcv_invalid_json', 'Invalid JSON payload.', array( 'status' => 400 ) );
        }

        dcv_webhook_log(
            'incoming_delivery',
            'Delivery verified successfully.',
            array( 'event' => $event )
        );

        // Dispatch based on event type.
        $event_name = isset( $payload['event'] ) ? $payload['event'] : $event;

        switch ( $event_name ) {
            case 'order.fulfilled':
                $this->handle_order_fulfilled( $payload );
                break;

            default:
                dcv_webhook_log(
                    'incoming_delivery',
                    "Unhandled event type: {$event_name}",
                    array( 'event' => $event_name )
                );
                break;
        }

        return rest_ensure_response( array( 'received' => true ) );
    }

    /**
     * Handles an 'order.fulfilled' event from the platform.
     *
     * Attempts to find a matching WooCommerce order by reference ID and mark it
     * as completed.
     *
     * @param array $payload The webhook payload.
     */
    protected function handle_order_fulfilled( $payload ) {
        if ( ! function_exists( 'wc_get_orders' ) ) {
            dcv_webhook_log( 'order_fulfilled', 'WooCommerce not active — cannot process order.fulfilled.', array() );
            return;
        }

        $order_id = isset( $payload['orderId'] ) ? $payload['orderId'] : null;

        if ( ! $order_id ) {
            dcv_webhook_log( 'order_fulfilled', 'No orderId in payload — cannot match WooCommerce order.', array() );
            return;
        }

        $orders = wc_get_orders(
            array(
                'meta_key'   => '_dcv_reference_id',
                'meta_value' => $order_id,
                'limit'      => 1,
            )
        );

        if ( empty( $orders ) ) {
            dcv_webhook_log( 'order_fulfilled', "No WooCommerce order found for reference ID: {$order_id}", array() );
            return;
        }

        $wc_order = $orders[0];

        if ( $wc_order->get_status() === 'completed' ) {
            dcv_webhook_log( 'order_fulfilled', "Order {$wc_order->get_id()} already completed.", array() );
            return;
        }

        $wc_order->update_status( 'completed', __( 'Fulfilled by Digital Code Vault.', 'dcv-webhook' ) );
        $wc_order->add_order_note(
            sprintf(
                /* translators: 1: fulfillment ID, 2: product name */
                __( 'Digital Code Vault fulfillment completed. Fulfillment ID: %1$s, Product: %2$s', 'dcv-webhook' ),
                isset( $payload['fulfillmentId'] ) ? $payload['fulfillmentId'] : 'N/A',
                isset( $payload['productName'] ) ? $payload['productName'] : 'N/A'
            )
        );

        dcv_webhook_log(
            'order_fulfilled',
            "WooCommerce order {$wc_order->get_id()} marked as completed.",
            array( 'order_id' => $wc_order->get_id(), 'reference' => $order_id )
        );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  Direction 1: WooCommerce → Platform (forward order events)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Forwards a WooCommerce order event to the platform's incoming webhook URL.
     *
     * @param int    $order_id WooCommerce order ID.
     * @param string $status   The order status that triggered the hook.
     */
    protected function forward_woocommerce_order( $order_id, $status ) {
        $settings = dcv_webhook_get_settings();

        if ( empty( $settings['api_key'] ) ) {
            return;
        }

        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return;
        }

        $base_url    = rtrim( $settings['api_url'], '/' );
        $incoming_url = $base_url . '/webhooks/incoming';

        $items = $order->get_items();
        $first_item = ! empty( $items ) ? reset( $items ) : null;

        // Build line_items array with ALL items in the order.
        $line_items = array();
        foreach ( $items as $item ) {
            $product = $item->get_product();
            $line_items[] = array(
                'product_id'    => strval( $item->get_product_id() ),
                'name'          => $item->get_name(),
                'sku'           => $product ? $product->get_sku() : null,
                'quantity'      => $item->get_quantity(),
                'variation_id'  => strval( $item->get_variation_id() ),
            );
        }

        $payload = array(
            'platform'       => 'woocommerce',
            'order_id'       => strval( $order->get_id() ),
            'product_id'     => $first_item ? strval( $first_item->get_product_id() ) : null,
            'product_name'   => $first_item ? $first_item->get_name() : null,
            'product_sku'    => $first_item && $first_item->get_product() ? $first_item->get_product()->get_sku() : null,
            'customer_name'  => trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ),
            'customer_email' => $order->get_billing_email(),
            'amount'         => floatval( $order->get_total() ),
            'currency'       => $order->get_currency(),
            'payment_status' => $status,
            'order_status'   => $order->get_status(),
            'line_items'     => $line_items,
        );

        // Store reference ID on the order for later matching (platform → WooCommerce).
        $order->update_meta_data( '_dcv_reference_id', strval( $order->get_id() ) );
        $order->save();

        $headers = array(
            'X-WC-Webhook-Source' => home_url(),
            'X-WC-Webhook-Topic'  => "order.{$status}",
        );

        $client = new DCV_Webhook_API_Client( $settings['api_key'], $settings['api_url'], $settings['webhook_secret'] );
        $result = $client->forward_incoming( $incoming_url, $payload, $headers );

        if ( is_wp_error( $result ) ) {
            dcv_webhook_log(
                'woocommerce_forward',
                "Failed to forward order {$order_id} (status: {$status}).",
                array( 'error' => $result->get_error_message() )
            );
        }
    }

    /**
     * Hook: woocommerce_order_status_processing
     *
     * @param int $order_id WooCommerce order ID.
     */
    public function on_woocommerce_order_processing( $order_id ) {
        $this->forward_woocommerce_order( $order_id, 'processing' );
    }

    /**
     * Hook: woocommerce_order_status_completed
     *
     * @param int $order_id WooCommerce order ID.
     */
    public function on_woocommerce_order_completed( $order_id ) {
        $this->forward_woocommerce_order( $order_id, 'completed' );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  Direction 1: Elementor → Platform (forward form submissions)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Hook: elementor_pro/forms/new_record
     *
     * Forwards Elementor form submissions to the platform's incoming webhook URL.
     *
     * @param ElementorPro\Modules\Forms\Classes\Form_Record $record  The form record.
     * @param ElementorPro\Modules\Forms\Classes\Ajax_Handler $ajax_handler The AJAX handler.
     */
    public function on_elementor_form_submit( $record, $ajax_handler ) {
        $settings = dcv_webhook_get_settings();

        if ( empty( $settings['api_key'] ) ) {
            return;
        }

        $form_data = $record->get( 'fields' );
        if ( empty( $form_data ) || ! is_array( $form_data ) ) {
            return;
        }

        // Extract field values into a flat key-value map.
        $fields = array();
        foreach ( $form_data as $key => $field ) {
            $fields[ $key ] = isset( $field['value'] ) ? $field['value'] : '';
        }

        // Try to extract common fields.
        $customer_name  = '';
        $customer_email = '';
        foreach ( $fields as $key => $value ) {
            $key_lower = strtolower( $key );
            if ( empty( $customer_email ) && filter_var( $value, FILTER_VALIDATE_EMAIL ) ) {
                $customer_email = $value;
            }
            if ( empty( $customer_name ) && ( strpos( $key_lower, 'name' ) !== false || strpos( $key_lower, 'nom' ) !== false ) ) {
                $customer_name = $value;
            }
        }

        $payload = array(
            'platform'       => 'elementor',
            'source'         => 'elementor_form',
            'form_id'        => $record->get( 'form_instance_id' ),
            'form_fields'    => $fields,
            'customer_name'  => $customer_name,
            'customer_email' => $customer_email,
            'site_url'       => home_url(),
        );

        $base_url     = rtrim( $settings['api_url'], '/' );
        $incoming_url = $base_url . '/webhooks/incoming';

        $headers = array(
            'X-WC-Webhook-Source' => home_url(),
            'X-WC-Webhook-Topic'  => 'elementor.form.submitted',
        );

        $client = new DCV_Webhook_API_Client( $settings['api_key'], $settings['api_url'], $settings['webhook_secret'] );
        $result = $client->forward_incoming( $incoming_url, $payload, $headers );

        if ( is_wp_error( $result ) ) {
            dcv_webhook_log(
                'elementor_forward',
                'Failed to forward Elementor form submission.',
                array( 'error' => $result->get_error_message() )
            );
        }
    }
}
}
