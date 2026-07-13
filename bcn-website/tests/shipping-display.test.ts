import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatAddressValidationStatus,
  formatOrderShippingMethod,
  formatShippingAddress,
  formatShippingCarrierService,
  formatShippingProvider
} from "../lib/shipping/order-display";

describe("shipping order display helpers", () => {
  it("uses the saved shipping method name first", () => {
    assert.equal(
      formatOrderShippingMethod({
        fulfillment_type: "shipping",
        shipping_method_name: "USPS Ground Advantage - Tracked",
        shipping_carrier: "USPS",
        shipping_service: "Ground Advantage"
      }),
      "USPS Ground Advantage - Tracked"
    );
  });

  it("falls back to carrier and service when the method name is missing", () => {
    assert.equal(
      formatOrderShippingMethod({
        fulfillment_type: "shipping",
        shipping_carrier: "USPS",
        shipping_service: "Priority Mail"
      }),
      "USPS - Priority Mail"
    );
  });

  it("formats Stripe and Shippo address shapes without placeholders", () => {
    assert.equal(
      formatShippingAddress({
        name: "BCN Customer",
        line1: "123 Forest Rd",
        city: "Effort",
        state: "PA",
        postal_code: "18330",
        country: "US"
      }),
      "BCN Customer\n123 Forest Rd\nEffort, PA 18330\nUS"
    );
    assert.equal(formatShippingAddress(null), "");
  });

  it("formats provider, carrier, and validation status values for admin display", () => {
    assert.equal(formatShippingCarrierService({ shipping_carrier: "USPS", shipping_service: "USPS Ground Advantage" }), "USPS Ground Advantage");
    assert.equal(formatShippingProvider("manual_usps_letter"), "Manual USPS Letter");
    assert.equal(formatAddressValidationStatus("validation_unavailable"), "Validation Unavailable");
  });
});
