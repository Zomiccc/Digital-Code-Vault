"use strict";
// Shared types for Digital Code Vault & Fulfillment Platform
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGoogleMapsUrl = buildGoogleMapsUrl;
/**
 * Builds a Google Maps search URL for a given address.
 * The address is URL-encoded automatically.
 * Opens in a new tab when used with target="_blank" rel="noopener noreferrer".
 */
function buildGoogleMapsUrl(address) {
    const encoded = encodeURIComponent(address.trim());
    return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}
