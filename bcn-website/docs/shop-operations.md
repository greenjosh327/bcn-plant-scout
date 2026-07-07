# BCN Shop Operations Runbook

This is the working checklist for running the Base Camp North shop without having to remember every moving part.

## Daily Check

1. Open the owner admin page: `https://shop.basecampnorthpa.com/admin`.
2. Check `Orders` first.
3. Work from `New` and `Open` orders before editing catalog items.
4. For pickup orders, use the pickup message button, then mark the order ready when it is staged.
5. For shipping orders, copy the shipping address, pack the order, then update the order status.
6. Check Stripe only when money or webhook status looks wrong.

## Order Flow

1. Customer pays through Stripe Checkout.
2. Stripe sends `checkout.session.completed` to the webhook.
3. The webhook saves the order and order items in Supabase.
4. Inventory is reduced after the order is saved.
5. The admin order screen becomes the working queue.

If Stripe shows a successful payment but the admin screen does not show an order, check the Stripe webhook delivery log first.

## Catalog Upkeep

Use the catalog filters as the first sweep:

- `Needs Photo`: products without a product image.
- `Low Stock`: active products with 1 to 5 available.
- `Sold Out`: active products with no available inventory.
- `Hidden`: inactive products that are not visible to customers.

Keep product names plain and searchable. Use variants for pack size, pot size, seed counts, or other customer choices.

## Product Options

Examples:

- `25 seed pack`
- `50 seed pack`
- `1 gallon pot`
- `Bare root`
- `Local pickup only`

Each variant should have its own price, SKU when useful, inventory count, and active or hidden status.

## Photos

Use the product photo area to add images directly from the admin screen. You can upload one image or a batch of images at once.

Best practice:

1. Add one clear primary image.
2. Keep the first image focused on the item being sold.
3. Use secondary images for leaf, fruit, seed, bark, or scale details.
4. Delete old or confusing images instead of letting them pile up.
5. Use `Make primary` when a different image should be the storefront image.
6. Use the photo note field for simple alt text, such as `Chestnut seed pack` or `Elderberry cutting bundle`.

## Inventory Rules

- Reduce inventory only through successful paid orders or intentional admin edits.
- Use `Sold out` on a variant when the option should stay listed but cannot be purchased.
- Hide products when the entire item should leave the storefront.
- If inventory looks wrong, compare the admin order list to recent Stripe payments.

## Payment Checks

Stripe is the source of truth for payment. Supabase is the source of truth for fulfillment work.

Check Stripe when:

- An order does not appear.
- A customer says they paid but the admin screen is empty.
- A webhook delivery is failing.
- A refund is needed.

## Deploying Shop Changes

The shop deploys from the GitHub repository through Vercel.

After code changes:

1. Run `npm run build` inside `C:\BCNPlantTracker\bcn-website`.
2. Commit and push the change.
3. Wait for Vercel to deploy.
4. Open the live shop and test one read-only path.

## Manual Test After Changes

Use this short pass before calling a shop update good:

1. Open the public shop page.
2. View a product with variants.
3. Add a variant to the cart.
4. Confirm the cart count changes.
5. Open admin and confirm products load.
6. Use catalog filters: needs photo, low stock, sold out, hidden.
7. Open Orders and confirm the order list loads.
8. Do not run a real checkout unless payment behavior was changed.

## Known Watch Items

- Webhook failures should be fixed before relying on inventory counts.
- Product photos should stay under control so the page remains fast.
- Shipping/tax rules need a real-world test before wide promotion.
- The admin screen is owner-only, but Supabase policies should stay tight.
