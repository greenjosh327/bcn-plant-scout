import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  carrierTokenFromOrderCarrier,
  formatTrackingStatus,
  mergeUniqueStrings,
  orderIdFromShippoMetadata,
  parseShippoTrackingUpdate,
  parseShippoTransactionUpdate
} from "../lib/shipping/tracking";

describe("Shippo tracking helpers", () => {
  it("parses track_updated webhook payloads", () => {
    const update = parseShippoTrackingUpdate({
      event: "track_updated",
      data: {
        carrier: "usps",
        tracking_number: "9205590164917312751089",
        transaction: "txn_123",
        eta: "2026-07-15T12:00:00Z",
        metadata: "bcn_order:123e4567-e89b-12d3-a456-426614174000",
        tracking_history: [{ status: "PRE_TRANSIT" }, { status: "TRANSIT" }],
        tracking_status: {
          status: "TRANSIT",
          status_details: "Accepted at USPS origin facility.",
          status_date: "2026-07-14T12:00:00Z",
          substatus: {
            code: "package_accepted",
            action_required: false
          }
        }
      }
    });

    assert.equal(update?.carrier, "usps");
    assert.equal(update?.status, "TRANSIT");
    assert.equal(update?.substatus, "package_accepted");
    assert.equal(update?.trackingHistory.length, 2);
  });

  it("parses transaction updates and metadata order ids", () => {
    const update = parseShippoTransactionUpdate({
      event: "transaction_updated",
      data: {
        object_id: "txn_123",
        status: "REFUNDPENDING",
        tracking_number: "9400",
        metadata: "bcn_order:123e4567-e89b-12d3-a456-426614174000"
      }
    });

    assert.equal(update?.transactionId, "txn_123");
    assert.equal(update?.status, "REFUNDPENDING");
    assert.equal(orderIdFromShippoMetadata(update?.metadata), "123e4567-e89b-12d3-a456-426614174000");
  });

  it("normalizes display helpers", () => {
    assert.deepEqual(mergeUniqueStrings(["a", "b"], "a", "c", ""), ["a", "b", "c"]);
    assert.equal(carrierTokenFromOrderCarrier("US Postal Service"), "usps");
    assert.equal(formatTrackingStatus("PRE_TRANSIT"), "Pre Transit");
  });
});
