<?php
/**
 * Settings Page — WordPress admin settings for the DCV Webhook Connector.
 *
 * Provides API Key input, API URL, skip-verification toggle, a "Register this site"
 * button, and displays the current registration status.
 *
 * @package DCV_Webhook
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

if ( ! class_exists( 'DCV_Webhook_Settings_Page' ) ) {
class DCV_Webhook_Settings_Page {

    const PAGE_SLUG  = 'dcv-webhook-settings';
    const SECTION_ID = 'dcv_webhook_main_section';
    const OPTION_GROUP = 'dcv_webhook_settings_group';

    /**
     * Constructor — hooks into admin menu and settings registration.
     */
    public function __construct() {
        add_action( 'admin_menu', array( $this, 'add_admin_menu' ) );
        add_action( 'admin_init', array( $this, 'register_settings' ) );
        add_action( 'admin_post_dcv_register_endpoint', array( $this, 'handle_register_endpoint' ) );
        add_action( 'admin_notices', array( $this, 'display_admin_notices' ) );
    }

    /**
     * Adds the settings page under the WooCommerce menu (or Settings if WC is absent).
     */
    public function add_admin_menu() {
        $parent = 'woocommerce';
        $cap    = 'manage_woocommerce';

        if ( ! function_exists( 'WC' ) ) {
            $parent = 'options-general.php';
            $cap    = 'manage_options';
        }

        add_submenu_page(
            $parent,
            __( 'DCV Webhook', 'dcv-webhook' ),
            __( 'DCV Webhook', 'dcv-webhook' ),
            $cap,
            self::PAGE_SLUG,
            array( $this, 'render_settings_page' )
        );
    }

    /**
     * Registers the settings, sections, and fields.
     */
    public function register_settings() {
        register_setting(
            self::OPTION_GROUP,
            DCV_WEBHOOK_OPTION_KEY,
            array( $this, 'sanitize_settings' )
        );

        add_settings_section(
            self::SECTION_ID,
            __( 'Webhook Connection Settings', 'dcv-webhook' ),
            array( $this, 'render_section_description' ),
            self::PAGE_SLUG
        );

        add_settings_field(
            'dcv_api_key',
            __( 'API Key', 'dcv-webhook' ),
            array( $this, 'render_api_key_field' ),
            self::PAGE_SLUG,
            self::SECTION_ID
        );

        add_settings_field(
            'dcv_api_url',
            __( 'API Base URL', 'dcv-webhook' ),
            array( $this, 'render_api_url_field' ),
            self::PAGE_SLUG,
            self::SECTION_ID
        );

        add_settings_field(
            'dcv_webhook_secret',
            __( 'Webhook Secret', 'dcv-webhook' ),
            array( $this, 'render_webhook_secret_field' ),
            self::PAGE_SLUG,
            self::SECTION_ID
        );

        add_settings_field(
            'dcv_skip_verification',
            __( 'Skip Verification', 'dcv-webhook' ),
            array( $this, 'render_skip_verification_field' ),
            self::PAGE_SLUG,
            self::SECTION_ID
        );
    }

    /**
     * Sanitizes settings input.
     *
     * @param array $input Raw input.
     * @return array Sanitized settings.
     */
    public function sanitize_settings( $input ) {
        $sanitized = array();

        // API key: preserve existing if input is empty (user didn't change it).
        $existing = dcv_webhook_get_settings();
        $new_key  = isset( $input['api_key'] ) ? trim( $input['api_key'] ) : '';

        if ( empty( $new_key ) ) {
            // Keep existing key if the field was left blank (masked display behavior).
            $sanitized['api_key'] = $existing['api_key'];
        } else {
            $sanitized['api_key'] = sanitize_text_field( $new_key );
        }

        $sanitized['api_url'] = isset( $input['api_url'] )
            ? esc_url_raw( trim( $input['api_url'] ) )
            : 'http://localhost:3000/api/v1';

        // Strip trailing /webhooks/incoming if the user pasted the webhook endpoint
        // URL instead of the API base URL (common mistake — the integrations page
        // prominently shows the webhook endpoint URL).
        $sanitized['api_url'] = preg_replace(
            '#/webhooks/incoming/?$#i',
            '',
            $sanitized['api_url']
        );

        $sanitized['skip_verification'] = isset( $input['skip_verification'] ) ? '1' : '';

        $new_secret = isset( $input['webhook_secret'] ) ? trim( $input['webhook_secret'] ) : '';
        if ( empty( $new_secret ) ) {
            $sanitized['webhook_secret'] = $existing['webhook_secret'];
        } else {
            $sanitized['webhook_secret'] = sanitize_text_field( $new_secret );
        }

        return $sanitized;
    }

    /**
     * Renders the section description.
     */
    public function render_section_description() {
        echo '<p>' . esc_html__(
            'Configure the connection between this site and the Digital Code Vault platform. Generate an API key from the merchant/admin portal first, then paste it here.',
            'dcv-webhook'
        ) . '</p>';
    }

    /**
     * Renders the API key field.
     * The key is masked after saving — the field shows a placeholder and only
     * accepts a new value via "replace" (not "view").
     */
    public function render_api_key_field() {
        $settings = dcv_webhook_get_settings();
        $has_key  = ! empty( $settings['api_key'] );

        echo '<input type="password" id="dcv_api_key" name="' . esc_attr( DCV_WEBHOOK_OPTION_KEY ) . '[api_key]"';
        echo ' value="" placeholder="' . esc_attr( $has_key ? '•••••••••••• (saved — enter new key to replace)' : 'pk_xxxxxxxx.yyyyyyyy' ) . '"';
        echo ' class="regular-text" autocomplete="off" />';
        echo '<p class="description">' . esc_html__(
            'Your merchant API key from the Digital Code Vault admin portal. Format: pk_xxx.yyy. Leave blank to keep the saved key.',
            'dcv-webhook'
        ) . '</p>';
    }

    /**
     * Renders the API URL field.
     */
    public function render_api_url_field() {
        $settings = dcv_webhook_get_settings();

        echo '<input type="url" id="dcv_api_url" name="' . esc_attr( DCV_WEBHOOK_OPTION_KEY ) . '[api_url]"';
        echo ' value="' . esc_attr( $settings['api_url'] ) . '" class="regular-text" />';
        echo '<p class="description">' . esc_html__(
            'The base URL of the Digital Code Vault API, including the /api/v1 prefix.',
            'dcv-webhook'
        ) . '</p>';
    }

    /**
     * Renders the webhook secret field.
     */
    public function render_webhook_secret_field() {
        $settings = dcv_webhook_get_settings();
        $has_secret = ! empty( $settings['webhook_secret'] );

        echo '<input type="password" id="dcv_webhook_secret" name="' . esc_attr( DCV_WEBHOOK_OPTION_KEY ) . '[webhook_secret]"';
        echo ' value="" placeholder="' . esc_attr( $has_secret ? '•••••••••••• (saved — enter new secret to replace)' : 'Get this from your merchant portal Webhooks page' ) . '"';
        echo ' class="regular-text" autocomplete="off" />';
        echo '<p class="description">' . esc_html__(
            'Your webhook secret from the Digital Code Vault merchant portal (Webhooks page). This is required for sending order events to the platform.',
            'dcv-webhook'
        ) . '</p>';
    }

    /**
     * Renders the skip verification checkbox.
     */
    public function render_skip_verification_field() {
        $settings = dcv_webhook_get_settings();

        echo '<label><input type="checkbox" id="dcv_skip_verification" name="' . esc_attr( DCV_WEBHOOK_OPTION_KEY ) . '[skip_verification]" value="1"';
        checked( $settings['skip_verification'], '1' );
        echo ' />';
        echo ' ' . esc_html__( 'Skip challenge-response verification when registering (use if your site does not echo the challenge).', 'dcv-webhook' ) . '</label>';
    }

    /**
     * Handles the "Register this site" form submission.
     */
    public function handle_register_endpoint() {
        if ( ! current_user_can( 'manage_woocommerce' ) && ! current_user_can( 'manage_options' ) ) {
            wp_die( esc_html__( 'You do not have permission to perform this action.', 'dcv-webhook' ) );
        }

        check_admin_referer( 'dcv_register_endpoint' );

        $settings = dcv_webhook_get_settings();

        if ( empty( $settings['api_key'] ) ) {
            set_transient( 'dcv_webhook_notice', array(
                'type'    => 'error',
                'message' => __( 'Cannot register: no API key configured. Save your API key first.', 'dcv-webhook' ),
            ), 45 );
            wp_safe_redirect( add_query_arg( 'page', self::PAGE_SLUG, admin_url( 'admin.php' ) ) );
            exit;
        }

        $webhook_url = rest_url( 'dcv/v1/webhook' );
        $skip        = $settings['skip_verification'] === '1';

        $client = new DCV_Webhook_API_Client( $settings['api_key'], $settings['api_url'], $settings['webhook_secret'] );
        $result = $client->register_endpoint( $webhook_url, $skip );

        if ( is_wp_error( $result ) ) {
            $error_data = $result->get_error_data();
            $error_body = '';
            if ( is_array( $error_data ) && isset( $error_data['body'] ) ) {
                $parsed = json_decode( $error_data['body'], true );
                if ( is_array( $parsed ) && isset( $parsed['message'] ) ) {
                    $error_body = $parsed['message'];
                } else {
                    $error_body = substr( $error_data['body'], 0, 300 );
                }
            }
            set_transient( 'dcv_webhook_notice', array(
                'type'    => 'error',
                'message' => sprintf(
                    /* translators: 1: error message, 2: server error detail */
                    __( 'Registration failed: %1$s. Server response: %2$s', 'dcv-webhook' ),
                    $result->get_error_message(),
                    $error_body
                ),
            ), 45 );
        } else {
            // Store the endpoint data (id, url, status, secret).
            update_option( DCV_WEBHOOK_ENDPOINT_OPTION, array(
                'id'     => $result['id'],
                'url'    => $result['url'],
                'status' => $result['status'],
                'secret' => $result['secret'],
            ) );

            set_transient( 'dcv_webhook_notice', array(
                'type'    => 'success',
                'message' => sprintf(
                    /* translators: 1: endpoint ID, 2: status */
                    __( 'Webhook registered successfully. Endpoint ID: %1$s, Status: %2$s', 'dcv-webhook' ),
                    $result['id'],
                    $result['status']
                ),
            ), 45 );
        }

        wp_safe_redirect( add_query_arg( 'page', self::PAGE_SLUG, admin_url( 'admin.php' ) ) );
        exit;
    }

    /**
     * Displays admin notices from the registration flow.
     */
    public function display_admin_notices() {
        $notice = get_transient( 'dcv_webhook_notice' );

        if ( ! is_array( $notice ) ) {
            return;
        }

        delete_transient( 'dcv_webhook_notice' );

        $class = $notice['type'] === 'success' ? 'notice-success' : 'notice-error';
        echo '<div class="notice ' . esc_attr( $class ) . ' is-dismissible"><p>';
        echo esc_html( $notice['message'] );
        echo '</p></div>';
    }

    /**
     * Renders the full settings page (form + registration status + register button).
     */
    public function render_settings_page() {
        if ( ! current_user_can( 'manage_woocommerce' ) && ! current_user_can( 'manage_options' ) ) {
            return;
        }

        $endpoint = dcv_webhook_get_endpoint();
        $settings = dcv_webhook_get_settings();
        $webhook_url = rest_url( 'dcv/v1/webhook' );

        require DCV_WEBHOOK_PLUGIN_DIR . 'admin/partials/settings-display.php';
    }
}
}
