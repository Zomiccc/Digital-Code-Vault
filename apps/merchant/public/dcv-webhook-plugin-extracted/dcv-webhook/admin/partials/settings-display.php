<?php
/**
 * Settings page display partial.
 *
 * @package DCV_Webhook
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * @var array|false $endpoint    Stored endpoint data or false if not registered.
 * @var array       $settings    Plugin settings.
 * @var string      $webhook_url The REST URL the platform will deliver to.
 */
?>

<div class="wrap">
    <h1><?php echo esc_html__( 'Digital Code Vault Webhook Connector', 'dcv-webhook' ); ?></h1>

    <h2><?php echo esc_html__( 'Connection Settings', 'dcv-webhook' ); ?></h2>
    <form method="post" action="options.php">
        <?php
        settings_fields( DCV_Webhook_Settings_Page::OPTION_GROUP );
        do_settings_sections( DCV_Webhook_Settings_Page::PAGE_SLUG );
        submit_button( __( 'Save Settings', 'dcv-webhook' ) );
        ?>
    </form>

    <hr>

    <h2><?php echo esc_html__( 'Webhook Registration', 'dcv-webhook' ); ?></h2>

    <p>
        <strong><?php echo esc_html__( 'Delivery URL:', 'dcv-webhook' ); ?></strong>
        <code><?php echo esc_html( $webhook_url ); ?></code>
    </p>
    <p class="description">
        <?php esc_html_e( 'This is the URL the platform will send webhook deliveries to. It must be publicly reachable.', 'dcv-webhook' ); ?>
    </p>

    <?php if ( $endpoint ) : ?>
        <table class="form-table" role="presentation">
            <tr>
                <th scope="row"><?php echo esc_html__( 'Endpoint ID', 'dcv-webhook' ); ?></th>
                <td><code><?php echo esc_html( $endpoint['id'] ); ?></code></td>
            </tr>
            <tr>
                <th scope="row"><?php echo esc_html__( 'Registered URL', 'dcv-webhook' ); ?></th>
                <td><code><?php echo esc_html( $endpoint['url'] ); ?></code></td>
            </tr>
            <tr>
                <th scope="row"><?php echo esc_html__( 'Status', 'dcv-webhook' ); ?></th>
                <td>
                    <span class="dashicons dashicons-yes-alt" style="color: #46b450;"></span>
                    <?php echo esc_html( $endpoint['status'] ); ?>
                </td>
            </tr>
            <tr>
                <th scope="row"><?php echo esc_html__( 'Endpoint Secret', 'dcv-webhook' ); ?></th>
                <td><code>••••••••••••</code>
                    <p class="description">
                        <?php esc_html_e( 'Stored securely. Used to verify incoming deliveries from the platform.', 'dcv-webhook' ); ?>
                    </p>
                </td>
            </tr>
        </table>
        <p>
            <a class="button button-secondary"
               href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=dcv_register_endpoint' ), 'dcv_register_endpoint' ) ); ?>">
                <?php echo esc_html__( 'Re-register this site', 'dcv-webhook' ); ?>
            </a>
        </p>
    <?php else : ?>
        <p>
            <?php echo esc_html__( 'This site is not yet registered as a webhook endpoint.', 'dcv-webhook' ); ?>
        </p>
        <p>
            <a class="button button-primary"
               href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=dcv_register_endpoint' ), 'dcv_register_endpoint' ) ); ?>">
                <?php echo esc_html__( 'Register this site', 'dcv-webhook' ); ?>
            </a>
        </p>
    <?php endif; ?>

    <hr>

    <h2><?php echo esc_html__( 'Event Forwarding', 'dcv-webhook' ); ?></h2>
    <p><?php echo esc_html__( 'The following events are automatically forwarded to the platform:', 'dcv-webhook' ); ?></p>
    <ul style="list-style: disc; padding-left: 20px;">
        <li><strong>WooCommerce order processing</strong> — <?php echo esc_html__( 'forwarded when an order moves to "processing" status', 'dcv-webhook' ); ?></li>
        <li><strong>WooCommerce order completed</strong> — <?php echo esc_html__( 'forwarded when an order moves to "completed" status', 'dcv-webhook' ); ?></li>
        <li><strong>Elementor form submissions</strong> — <?php echo esc_html__( 'forwarded on each Elementor Pro form submission', 'dcv-webhook' ); ?></li>
    </ul>

    <h2><?php echo esc_html__( 'Incoming Deliveries', 'dcv-webhook' ); ?></h2>
    <p><?php echo esc_html__( 'The platform can send the following events to this site:', 'dcv-webhook' ); ?></p>
    <ul style="list-style: disc; padding-left: 20px;">
        <li><strong>order.fulfilled</strong> — <?php echo esc_html__( 'marks the matching WooCommerce order as completed', 'dcv-webhook' ); ?></li>
    </ul>

    <hr>

    <h2><?php echo esc_html__( 'Debugging', 'dcv-webhook' ); ?></h2>
    <p class="description">
        <?php echo esc_html__( 'All webhook operations (registration, forwarding, delivery verification) are logged to the WordPress error log with the prefix [DCV-Webhook]. Check your server error log for troubleshooting.', 'dcv-webhook' ); ?>
    </p>
</div>
